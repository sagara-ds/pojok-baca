GRANT EXECUTE ON FUNCTION pojok_baca.admin_dashboard(uuid),pojok_baca.teacher_report(uuid,date,date,text),
  pojok_baca.admin_moderation(uuid,text,integer),pojok_baca.admin_moderate(uuid,text,bigint,text),
  pojok_baca.admin_recommend(uuid,text,boolean),pojok_baca.super_admin_users(uuid,text,text,integer),
  pojok_baca.super_admin_update_user(uuid,uuid,text,boolean),pojok_baca.super_admin_logs(uuid,integer),
  pojok_baca.super_admin_export_report(uuid,date,date,text),
  pojok_baca.super_admin_prepare_password_reset(uuid,uuid)
TO pojok_baca_app;
