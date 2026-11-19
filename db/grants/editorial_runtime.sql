GRANT SELECT (is_recommended) ON pojok_baca.current_book_catalog TO pojok_baca_app;
GRANT SELECT ON pojok_baca.public_editorial_counts,pojok_baca.public_readers_today TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.public_book_quotes(bigint), pojok_baca.library_position(uuid,bigint),
  pojok_baca.student_library(uuid), pojok_baca.change_student_library(uuid,text,text,uuid,integer,integer,bigint)
TO pojok_baca_app;
