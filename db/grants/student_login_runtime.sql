GRANT EXECUTE ON FUNCTION pojok_baca.login_target(text,text,text) TO pojok_baca_app;
GRANT SELECT (must_change_password, password_revoked_at) ON public.users TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.begin_school_password_change(uuid),
  pojok_baca.finish_school_password_change(uuid,uuid,uuid,boolean) TO pojok_baca_app;
