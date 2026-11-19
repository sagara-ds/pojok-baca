BEGIN;

CREATE VIEW pojok_baca.public_book_activity AS
SELECT b.id AS book_id,
       count(v.id) FILTER (WHERE v.event_type = 'detail_view') AS detail_views,
       count(DISTINCT v.user_id) FILTER (WHERE v.event_type = 'read_session') AS unique_readers
FROM pojok_baca.books b
LEFT JOIN pojok_baca.book_views v ON v.book_id = b.id
WHERE b.status = 'published' AND b.current_edition_id IS NOT NULL
GROUP BY b.id;

CREATE FUNCTION pojok_baca.recent_public_readers(p_book_id bigint)
RETURNS TABLE (name text, class_name text, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT u.name, u.class_name, max(v.created_at) AS read_at
    FROM pojok_baca.book_views v
    JOIN public.users u ON u.user_id = v.user_id
    JOIN pojok_baca.books b ON b.id = v.book_id
    WHERE v.book_id = p_book_id AND v.event_type = 'read_session'
      AND b.status = 'published' AND b.current_edition_id IS NOT NULL
      AND u.is_active AND u.role = 'user' AND u.show_in_public_readers AND u.class_name IS NOT NULL
    GROUP BY u.user_id, u.name, u.class_name
    ORDER BY read_at DESC, u.user_id
    LIMIT 5;
$$;

REVOKE ALL ON pojok_baca.public_book_activity FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pojok_baca.recent_public_readers(bigint) FROM PUBLIC;

COMMIT;
