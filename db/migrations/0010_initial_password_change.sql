BEGIN;

ALTER TABLE public.users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN password_operation_id uuid,
  ADD COLUMN password_operation_until timestamptz,
  ADD COLUMN password_revoked_at timestamptz;

CREATE FUNCTION pojok_baca.begin_school_password_change(p_user uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.users
  SET password_operation_id = gen_random_uuid(),
      password_operation_until = clock_timestamp() + interval '2 minutes'
  WHERE user_id = p_user AND is_active AND must_change_password
    AND (password_operation_until IS NULL OR password_operation_until <= clock_timestamp())
  RETURNING password_operation_id;
$$;

CREATE FUNCTION pojok_baca.finish_school_password_change(
  p_actor uuid, p_user uuid, p_operation uuid, p_succeeded boolean
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public.users
  SET must_change_password = (p_actor <> p_user OR NOT p_succeeded),
      password_revoked_at = CASE WHEN p_actor <> p_user THEN clock_timestamp() ELSE password_revoked_at END,
      password_operation_id = NULL,
      password_operation_until = NULL,
      updated_at = clock_timestamp()
  WHERE user_id = p_user AND password_operation_id = p_operation;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION pojok_baca.begin_school_password_change(uuid),
  pojok_baca.finish_school_password_change(uuid,uuid,uuid,boolean) FROM PUBLIC;

COMMIT;
