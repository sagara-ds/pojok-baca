BEGIN;

-- Preserve the role at the time of activity for teacher reports after role changes.
ALTER TABLE pojok_baca.reader_sessions ADD COLUMN actor_role text;
ALTER TABLE pojok_baca.book_views ADD COLUMN actor_role text;
ALTER TABLE pojok_baca.reading_page_reads ADD COLUMN actor_role text;
UPDATE pojok_baca.reader_sessions s SET actor_role=u.role FROM public.users u WHERE s.user_id=u.user_id;
UPDATE pojok_baca.book_views v SET actor_role=u.role FROM public.users u WHERE v.user_id=u.user_id;
UPDATE pojok_baca.reading_page_reads p SET actor_role=u.role FROM public.users u WHERE p.user_id=u.user_id;
ALTER TABLE pojok_baca.reader_sessions ALTER COLUMN actor_role SET NOT NULL;
ALTER TABLE pojok_baca.book_views ALTER COLUMN actor_role SET NOT NULL;
ALTER TABLE pojok_baca.reading_page_reads ALTER COLUMN actor_role SET NOT NULL;

CREATE FUNCTION pojok_baca.snapshot_activity_role()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  SELECT role INTO NEW.actor_role FROM public.users WHERE user_id=NEW.user_id;
  IF TG_TABLE_NAME='reading_page_reads' AND NEW.actor_role='user' THEN
    SELECT actor_role INTO NEW.actor_role FROM pojok_baca.reader_sessions WHERE id=NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reader_roles BEFORE INSERT ON pojok_baca.reader_sessions
FOR EACH ROW EXECUTE FUNCTION pojok_baca.snapshot_activity_role();
CREATE TRIGGER view_roles BEFORE INSERT ON pojok_baca.book_views
FOR EACH ROW EXECUTE FUNCTION pojok_baca.snapshot_activity_role();
CREATE TRIGGER page_read_roles BEFORE INSERT ON pojok_baca.reading_page_reads
FOR EACH ROW EXECUTE FUNCTION pojok_baca.snapshot_activity_role();

CREATE VIEW pojok_baca.public_editorial_counts AS
SELECT b.id AS book_id,
  (SELECT count(DISTINCT v.user_id) FROM pojok_baca.book_views v JOIN public.users u USING(user_id)
   WHERE v.book_id=b.id AND v.event_type='read_session' AND v.actor_role='user' AND u.role='user'
     AND v.created_at >= now()-interval '7 days') AS weekly_readers,
  (SELECT count(*) FROM pojok_baca.quotes q JOIN public.users u USING(user_id)
   WHERE q.book_id=b.id AND q.is_public AND q.moderation_status='approved' AND u.is_active) AS public_quotes
FROM pojok_baca.books b WHERE b.status='published' AND b.current_edition_id IS NOT NULL;

CREATE VIEW pojok_baca.public_readers_today AS
SELECT count(DISTINCT active.user_id) AS readers
FROM (
    SELECT user_id FROM pojok_baca.book_views
    WHERE event_type='read_session' AND actor_role='user'
      AND (created_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date
    UNION
    SELECT user_id FROM pojok_baca.reading_page_reads
    WHERE actor_role='user' AND read_on=(now() AT TIME ZONE 'Asia/Jakarta')::date
) active JOIN public.users u USING(user_id)
WHERE u.role='user' AND u.is_active;

CREATE FUNCTION pojok_baca.public_book_quotes(p_book bigint)
RETURNS TABLE (quote_text text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT q.quote_text FROM pojok_baca.quotes q
    JOIN pojok_baca.books b ON b.id=q.book_id
    JOIN public.users u USING(user_id)
    WHERE b.id=p_book AND b.status='published' AND q.is_public AND q.moderation_status='approved' AND u.is_active
    ORDER BY q.created_at DESC,q.id DESC LIMIT 25;
$$;

CREATE FUNCTION pojok_baca.library_position(p_user uuid,p_book bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT jsonb_build_object('page',h.last_page,'paragraph',h.last_paragraph_index)
    FROM pojok_baca.reading_histories h JOIN public.users u USING(user_id)
    JOIN pojok_baca.books b ON b.id=h.book_id
    WHERE h.user_id=p_user AND h.book_id=p_book AND u.is_active AND u.class_name IS NOT NULL
      AND b.status='published' AND b.current_edition_id=h.edition_id;
$$;

CREATE FUNCTION pojok_baca.student_library(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.users WHERE user_id=p_user AND is_active AND role='user' AND class_name IS NOT NULL)
  THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'history', coalesce((
      SELECT jsonb_agg(row_to_json(h)) FROM (
        SELECT b.slug,b.title,b.author,b.cover_url,h.last_page AS page,h.last_paragraph_index AS paragraph,
          h.progress_percentage AS progress,(b.status<>'published' OR b.current_edition_id IS DISTINCT FROM h.edition_id) AS archived
        FROM pojok_baca.reading_histories h JOIN pojok_baca.books b ON b.id=h.book_id
        WHERE h.user_id=p_user ORDER BY h.last_read_at DESC,h.book_id
      ) h
    ),'[]'::jsonb),
    'books', coalesce((
      SELECT jsonb_agg(row_to_json(f)) FROM (
        SELECT b.slug,b.title,b.author,b.cover_url,(b.status<>'published') AS archived
        FROM pojok_baca.favorite_books f JOIN pojok_baca.books b ON b.id=f.book_id
        WHERE f.user_id=p_user ORDER BY f.created_at DESC,f.book_id
      ) f
    ),'[]'::jsonb),
    'anchors', coalesce((
      SELECT jsonb_agg(row_to_json(f)) FROM (
        SELECT b.slug,b.title,f.edition_id AS edition,f.page_number AS page,f.paragraph_index AS paragraph,
          (b.status<>'published' OR b.current_edition_id IS DISTINCT FROM f.edition_id) AS archived
        FROM pojok_baca.favorite_pages f JOIN pojok_baca.book_editions e ON e.id=f.edition_id
        JOIN pojok_baca.books b ON b.id=e.book_id
        WHERE f.user_id=p_user ORDER BY f.created_at DESC,f.edition_id,f.page_number,f.paragraph_index
      ) f
    ),'[]'::jsonb),
    'quotes', coalesce((
      SELECT jsonb_agg(row_to_json(q)) FROM (
        SELECT q.id::text AS id,b.slug,b.title,q.quote_text AS text,q.is_public AS public,q.moderation_status AS moderation
        FROM pojok_baca.quotes q JOIN pojok_baca.books b ON b.id=q.book_id
        WHERE q.user_id=p_user ORDER BY q.created_at DESC,q.id DESC
      ) q
    ),'[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION pojok_baca.change_student_library(
    p_user uuid,p_action text,p_slug text,p_edition uuid,p_page integer,p_paragraph integer,p_quote bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.users WHERE user_id=p_user AND is_active AND role='user' AND class_name IS NOT NULL)
  THEN RETURN false; END IF;
  CASE p_action
    WHEN 'remove_book' THEN
      DELETE FROM pojok_baca.favorite_books f USING pojok_baca.books b
      WHERE f.user_id=p_user AND f.book_id=b.id AND b.slug=p_slug;
    WHEN 'remove_anchor' THEN
      DELETE FROM pojok_baca.favorite_pages WHERE user_id=p_user AND edition_id=p_edition
        AND page_number IS NOT DISTINCT FROM p_page AND paragraph_index IS NOT DISTINCT FROM p_paragraph;
    WHEN 'remove_quote' THEN
      DELETE FROM pojok_baca.quotes WHERE user_id=p_user AND id=p_quote;
    WHEN 'request_quote' THEN
      UPDATE pojok_baca.quotes SET is_public=true,moderation_status='pending'
      WHERE user_id=p_user AND id=p_quote AND (NOT is_public OR moderation_status='rejected');
    WHEN 'private_quote' THEN
      UPDATE pojok_baca.quotes SET is_public=false,moderation_status='pending' WHERE user_id=p_user AND id=p_quote;
    ELSE RETURN false;
  END CASE;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pojok_baca FROM PUBLIC;
REVOKE ALL ON pojok_baca.public_editorial_counts,pojok_baca.public_readers_today FROM PUBLIC;
COMMIT;
