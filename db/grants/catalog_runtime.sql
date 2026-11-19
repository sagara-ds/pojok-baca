GRANT USAGE ON SCHEMA pojok_baca TO pojok_baca_app;
GRANT SELECT (
    id, slug, title, author, categories, synopsis, cover_url, status,
    current_edition_id, created_at, book_type, total_pages, total_paragraphs
) ON pojok_baca.current_book_catalog TO pojok_baca_app;
GRANT SELECT ON pojok_baca.public_book_activity TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.record_detail_view(uuid, bigint) TO pojok_baca_app;
GRANT EXECUTE ON FUNCTION pojok_baca.recent_public_readers(bigint) TO pojok_baca_app;
