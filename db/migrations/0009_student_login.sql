BEGIN;

ALTER TABLE public.users
  ADD COLUMN username text UNIQUE CHECK (
    username ~ '^[a-z0-9][a-z0-9._-]{2,39}$' AND username ~ '[a-z]'
  ),
  ADD COLUMN nis text UNIQUE CHECK (nis ~ '^[0-9]{1,32}$');

WITH candidates AS (
  SELECT p.user_id, lower(split_part(a.email, '@', 1)) AS candidate
  FROM public.users p JOIN neon_auth."user" a ON a.id=p.user_id
), counted AS (
  SELECT *, count(*) OVER (PARTITION BY candidate) AS uses FROM candidates
)
UPDATE public.users p
SET username = CASE WHEN c.uses=1 AND c.candidate ~ '^[a-z0-9][a-z0-9._-]{2,39}$'
    AND c.candidate ~ '[a-z]' AND c.candidate !~ '^pb-[0-9a-f]{32}$' THEN c.candidate
  ELSE 'pb-' || replace(p.user_id::text, '-', '') END
FROM counted c WHERE c.user_id=p.user_id;

CREATE TABLE pojok_baca.login_rate_buckets (
  scope text NOT NULL CHECK (scope IN ('ip', 'identifier')),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, digest)
);
CREATE INDEX login_rate_expiry_idx ON pojok_baca.login_rate_buckets(expires_at);

CREATE TABLE pojok_baca.student_import_reservations (
  username text PRIMARY KEY,
  nis text NOT NULL UNIQUE,
  auth_email text NOT NULL UNIQUE
);

REVOKE ALL ON pojok_baca.login_rate_buckets, pojok_baca.student_import_reservations FROM PUBLIC;

CREATE FUNCTION pojok_baca.login_target(p_identifier text, p_ip_hash text, p_identifier_hash text)
RETURNS TABLE (limited boolean, user_id uuid, auth_email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  attempt_scope record;
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' OR
    p_identifier_hash IS NULL OR p_identifier_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT true, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  FOR attempt_scope IN SELECT * FROM (VALUES ('ip', p_ip_hash, 160), ('identifier', p_identifier_hash, 8))
    AS limits(scope, digest, max_attempts)
  LOOP
    INSERT INTO pojok_baca.login_rate_buckets AS b (scope, digest, attempts, expires_at)
    VALUES (attempt_scope.scope, attempt_scope.digest, 1, v_now + interval '10 minutes')
    ON CONFLICT (scope, digest) DO UPDATE SET
      attempts=CASE WHEN b.expires_at <= v_now THEN 1 ELSE least(b.attempts+1, attempt_scope.max_attempts+1) END,
      expires_at=CASE WHEN b.expires_at <= v_now THEN EXCLUDED.expires_at ELSE b.expires_at END
    RETURNING attempts INTO v_attempts;
    IF v_attempts > attempt_scope.max_attempts THEN
      RETURN QUERY SELECT true, NULL::uuid, NULL::text;
      RETURN;
    END IF;
  END LOOP;

  IF random() < 0.02 THEN
    DELETE FROM pojok_baca.login_rate_buckets b USING (
      SELECT scope, digest FROM pojok_baca.login_rate_buckets
      WHERE expires_at < v_now - interval '1 hour' ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
    ) old WHERE b.scope=old.scope AND b.digest=old.digest;
  END IF;

  RETURN QUERY SELECT false, p.user_id, a.email::text
    FROM public.users p JOIN neon_auth."user" a ON a.id=p.user_id
    WHERE p.is_active AND (p.username=p_identifier OR p.nis=p_identifier);
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid, NULL::text; END IF;
END;
$$;

REVOKE ALL ON FUNCTION pojok_baca.login_target(text,text,text) FROM PUBLIC;

COMMIT;
