BEGIN;

CREATE OR REPLACE FUNCTION pojok_baca.super_admin_users(p_actor uuid,p_search text,p_role text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN NULL; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(u) ORDER BY lower(u.name),u.id)
    FROM (
      SELECT user_id AS id,name,class_name AS class,role,is_active AS active,username,nis,
             must_change_password AS "mustChangePassword"
      FROM public.users
      WHERE (p_role IS NULL OR role=p_role) AND (p_search IS NULL OR
        strpos(lower(name),lower(p_search))>0 OR strpos(lower(class_name),lower(p_search))>0
        OR strpos(lower(username),lower(p_search))>0 OR strpos(nis,p_search)>0 OR strpos(nisn,p_search)>0)
      ORDER BY lower(name),user_id LIMIT 50 OFFSET 50*(least(greatest(p_page,1),100000)-1)
    ) u
  ),'[]'::jsonb);
END;
$$;

CREATE FUNCTION pojok_baca.super_admin_prepare_password_reset(p_actor uuid,p_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE operation uuid;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('pojok_baca:super_admin_roster',0)) THEN RETURN NULL; END IF;
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN NULL; END IF;
  UPDATE public.users
  SET must_change_password = true,
      password_operation_id = gen_random_uuid(),
      password_operation_until = clock_timestamp() + interval '2 minutes',
      password_revoked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE user_id = p_user AND role = 'user' AND is_active AND username IS NOT NULL
    AND (password_operation_until IS NULL OR password_operation_until <= clock_timestamp())
  RETURNING password_operation_id INTO operation;
  IF operation IS NOT NULL THEN
    INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
    VALUES(p_actor,'PREPARE_STUDENT_PASSWORD_RESET',jsonb_build_object('targetUser',p_user));
  END IF;
  RETURN operation;
END;
$$;

CREATE OR REPLACE FUNCTION pojok_baca.finish_school_password_change(
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
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_actor <> p_user THEN
    INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
    VALUES(p_actor,CASE WHEN p_succeeded THEN 'RESET_STUDENT_PASSWORD' ELSE 'FAILED_STUDENT_PASSWORD_RESET' END,
      jsonb_build_object('targetUser',p_user));
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION pojok_baca.super_admin_prepare_password_reset(uuid,uuid) FROM PUBLIC;

COMMIT;
