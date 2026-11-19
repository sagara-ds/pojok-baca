GRANT EXECUTE ON FUNCTION pojok_baca.admin_start_edition(uuid,text,text,text,text,text,text[],integer,text) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_upload_key(uuid,uuid,integer,integer) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_confirm_page(uuid,uuid,integer,text) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_finalize_edition(uuid,uuid) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_cancel_edition(uuid,uuid) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_cleanup_keys(uuid,uuid) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_finish_cleanup(uuid,uuid) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.admin_uploads(uuid) TO pojok_baca_app;
