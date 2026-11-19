BEGIN;

ALTER TABLE pojok_baca.reader_sessions
    ADD COLUMN reader_mode text NOT NULL DEFAULT 'page' CHECK (reader_mode IN ('page', 'text'));
ALTER TABLE pojok_baca.reading_histories
    ADD COLUMN position_session_at timestamptz NOT NULL DEFAULT '-infinity',
    ADD COLUMN position_session_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    ADD COLUMN position_sequence integer NOT NULL DEFAULT 0 CHECK (position_sequence >= 0);

ALTER TABLE pojok_baca.favorite_pages DROP CONSTRAINT favorite_pages_pkey;
ALTER TABLE pojok_baca.favorite_pages ALTER COLUMN page_number DROP NOT NULL;
ALTER TABLE pojok_baca.favorite_pages
    ADD COLUMN paragraph_index integer,
    ADD CONSTRAINT favorite_pages_one_anchor CHECK (num_nonnulls(page_number, paragraph_index) = 1),
    ADD CONSTRAINT favorite_pages_paragraph_fk FOREIGN KEY (edition_id, paragraph_index)
        REFERENCES pojok_baca.novel_paragraphs(edition_id, paragraph_index);
CREATE UNIQUE INDEX favorite_pages_page_key
    ON pojok_baca.favorite_pages (user_id, edition_id, page_number) WHERE page_number IS NOT NULL;
CREATE UNIQUE INDEX favorite_pages_paragraph_key
    ON pojok_baca.favorite_pages (user_id, edition_id, paragraph_index) WHERE paragraph_index IS NOT NULL;

CREATE TABLE pojok_baca.reader_page_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES pojok_baca.reader_sessions(id) ON DELETE RESTRICT,
    page_number integer NOT NULL CHECK (page_number > 0),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    ended_at timestamptz,
    qualified_at timestamptz
);
CREATE UNIQUE INDEX reader_page_visits_active
    ON pojok_baca.reader_page_visits (session_id) WHERE ended_at IS NULL;
CREATE INDEX reader_page_visits_qualified
    ON pojok_baca.reader_page_visits (session_id) WHERE qualified_at IS NOT NULL;

CREATE FUNCTION pojok_baca.open_private_reader(p_user uuid, p_slug text, p_text boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_book record;
    v_session uuid;
    v_mode text;
    v_position integer;
    v_content jsonb;
    v_book_favorite boolean;
BEGIN
    SELECT b.id, b.slug, b.title, b.author, e.id AS edition_id, e.total_pages, e.total_paragraphs
    INTO v_book
    FROM pojok_baca.books b
    JOIN pojok_baca.book_editions e ON e.id = b.current_edition_id
    JOIN public.users u ON u.user_id = p_user
    WHERE b.slug = p_slug AND b.status = 'published' AND e.state = 'ready'
      AND u.is_active AND u.class_name IS NOT NULL
    FOR SHARE OF b, e, u;
    IF NOT FOUND THEN RETURN NULL; END IF;

    v_mode := CASE WHEN v_book.total_paragraphs > 0 AND (p_text OR v_book.total_pages = 0)
        THEN 'text' ELSE 'page' END;
    INSERT INTO pojok_baca.reader_sessions (user_id, edition_id, reader_mode)
    VALUES (p_user, v_book.edition_id, v_mode) RETURNING id INTO v_session;
    SELECT CASE WHEN v_mode = 'text' THEN h.last_paragraph_index ELSE h.last_page END
    INTO v_position FROM pojok_baca.reading_histories h
    WHERE h.user_id = p_user AND h.book_id = v_book.id AND h.edition_id = v_book.edition_id;

    SELECT EXISTS (
        SELECT FROM pojok_baca.favorite_books f WHERE f.user_id = p_user AND f.book_id = v_book.id
    ) INTO v_book_favorite;

    IF v_mode = 'text' THEN
        SELECT jsonb_agg(jsonb_build_object(
            'index', p.paragraph_index, 'body', p.body, 'chapter', p.chapter_index, 'title', c.title,
            'favorite', f.user_id IS NOT NULL
        ) ORDER BY p.paragraph_index) INTO v_content
        FROM pojok_baca.novel_paragraphs p
        JOIN pojok_baca.novel_chapters c USING (edition_id, chapter_index)
        LEFT JOIN pojok_baca.favorite_pages f ON f.user_id = p_user
            AND f.edition_id = p.edition_id AND f.paragraph_index = p.paragraph_index
        WHERE p.edition_id = v_book.edition_id;
    ELSE
        SELECT jsonb_agg(jsonb_build_object(
            'number', p.page_number, 'assetPage', p.asset_page,
            'cropY', p.crop_y, 'cropHeight', p.crop_height,
            'hasText', p.extracted_text IS NOT NULL AND btrim(p.extracted_text) <> '',
            'favorite', f.user_id IS NOT NULL
        ) ORDER BY p.page_number) INTO v_content
        FROM (
            SELECT page_number, crop_y, crop_height, extracted_text,
                   min(page_number) OVER (PARTITION BY asset_key) AS asset_page
            FROM pojok_baca.book_pages WHERE edition_id = v_book.edition_id AND asset_key IS NOT NULL
        ) p
        LEFT JOIN pojok_baca.favorite_pages f ON f.user_id = p_user
            AND f.edition_id = v_book.edition_id AND f.page_number = p.page_number;
    END IF;
    RETURN jsonb_build_object(
        'session', v_session, 'edition', v_book.edition_id, 'slug', v_book.slug,
        'title', v_book.title, 'author', v_book.author, 'mode', v_mode,
        'hasPages', v_book.total_pages > 0, 'hasText', v_book.total_paragraphs > 0,
        'position', v_position, 'favorite', v_book_favorite,
        'content', coalesce(v_content, '[]'::jsonb)
    );
END;
$$;

CREATE FUNCTION pojok_baca.private_reader_asset(p_user uuid, p_edition uuid, p_page integer)
RETURNS TABLE (asset_key text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT p.asset_key, b.slug
    FROM pojok_baca.book_pages p
    JOIN pojok_baca.book_editions e ON e.id = p.edition_id
    JOIN pojok_baca.books b ON b.id = e.book_id
    JOIN public.users u ON u.user_id = p_user
    WHERE p.edition_id = p_edition AND p.page_number = p_page AND p.asset_key IS NOT NULL
      AND u.is_active AND u.class_name IS NOT NULL
      AND ((b.status = 'published' AND b.current_edition_id = e.id AND e.state = 'ready')
        OR (e.state = 'staging' AND b.status IN ('draft', 'published') AND u.role IN ('admin','super_admin')));
$$;

CREATE FUNCTION pojok_baca.reader_action(
    p_user uuid, p_session uuid, p_action text, p_index integer, p_seq integer,
    p_visit uuid, p_enabled boolean, p_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    s record;
    v_visit uuid;
    v_now timestamptz;
    v_page integer;
    v_paragraph integer;
    v_source text;
    v_quote text;
BEGIN
    SELECT rs.*, b.id AS book_id, e.total_pages, e.total_paragraphs INTO s
    FROM pojok_baca.reader_sessions rs
    JOIN pojok_baca.book_editions e ON e.id = rs.edition_id AND e.state = 'ready'
    JOIN pojok_baca.books b ON b.current_edition_id = e.id AND b.status = 'published'
    JOIN public.users u ON u.user_id = rs.user_id
    WHERE rs.id = p_session AND rs.user_id = p_user AND u.is_active AND u.class_name IS NOT NULL
      AND rs.started_at >= clock_timestamp() - interval '12 hours'
    FOR UPDATE OF rs FOR SHARE OF e, b, u;
    IF NOT FOUND THEN RETURN NULL; END IF;

    IF p_action = 'confirm' THEN
        IF NOT pojok_baca.confirm_read_session(p_user, p_session) THEN
            RETURN jsonb_build_object('error', 'not_ready');
        END IF;
        INSERT INTO pojok_baca.reading_page_reads(user_id, edition_id, page_number, session_id, qualified_at)
        SELECT p_user, s.edition_id, v.page_number, p_session, v.qualified_at
        FROM pojok_baca.reader_page_visits v WHERE v.session_id = p_session AND v.qualified_at IS NOT NULL
        ON CONFLICT DO NOTHING;
        RETURN '{"ok":true}'::jsonb;
    ELSIF p_action = 'favorite_book' AND p_enabled IS NOT NULL THEN
        IF p_enabled THEN
            INSERT INTO pojok_baca.favorite_books(user_id, book_id) VALUES (p_user, s.book_id)
            ON CONFLICT DO NOTHING;
        ELSE
            DELETE FROM pojok_baca.favorite_books WHERE user_id = p_user AND book_id = s.book_id;
        END IF;
        RETURN '{"ok":true}'::jsonb;
    ELSIF p_action IN ('finish_page', 'cancel_page') AND s.reader_mode = 'page' THEN
        v_now := clock_timestamp();
        IF p_action = 'cancel_page' THEN
            UPDATE pojok_baca.reader_page_visits SET ended_at = v_now
            WHERE session_id = p_session AND id = p_visit AND ended_at IS NULL;
            RETURN '{"ok":true}'::jsonb;
        END IF;
        UPDATE pojok_baca.reader_page_visits
        SET qualified_at = v_now, ended_at = v_now
        WHERE session_id = p_session AND id = p_visit AND ended_at IS NULL
          AND started_at <= v_now - interval '4 seconds'
        RETURNING page_number INTO v_page;
        IF NOT FOUND THEN
            IF EXISTS (SELECT FROM pojok_baca.reader_page_visits
                WHERE session_id = p_session AND id = p_visit AND qualified_at IS NOT NULL) THEN
                RETURN '{"ok":true}'::jsonb;
            END IF;
            RETURN jsonb_build_object('error', 'not_ready');
        END IF;
        IF s.confirmed_at IS NOT NULL THEN
            INSERT INTO pojok_baca.reading_page_reads(user_id, edition_id, page_number, session_id, qualified_at)
            VALUES (p_user, s.edition_id, v_page, p_session, v_now) ON CONFLICT DO NOTHING;
        END IF;
        RETURN '{"ok":true}'::jsonb;
    END IF;

    IF s.reader_mode = 'page' THEN
        SELECT page_number, extracted_text INTO v_page, v_source FROM pojok_baca.book_pages
        WHERE edition_id = s.edition_id AND page_number = p_index AND asset_key IS NOT NULL;
    ELSE
        SELECT paragraph_index, body INTO v_paragraph, v_source FROM pojok_baca.novel_paragraphs
        WHERE edition_id = s.edition_id AND paragraph_index = p_index;
    END IF;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_anchor'); END IF;

    CASE p_action
        WHEN 'position' THEN
            IF p_seq IS NULL OR p_seq < 1 THEN RETURN '{"error":"invalid_action"}'::jsonb; END IF;
            INSERT INTO pojok_baca.reading_histories AS h (
                user_id, book_id, edition_id, last_page, last_paragraph_index, progress_percentage,
                position_session_at, position_session_id, position_sequence
            ) VALUES (
                p_user, s.book_id, s.edition_id, v_page, v_paragraph,
                CASE WHEN v_page IS NOT NULL THEN v_page * 100.0 / s.total_pages
                     ELSE (v_paragraph + 1) * 100.0 / s.total_paragraphs END,
                s.started_at, s.id, p_seq
            ) ON CONFLICT (user_id, book_id) DO UPDATE SET
                edition_id=excluded.edition_id, last_page=excluded.last_page,
                last_paragraph_index=excluded.last_paragraph_index,
                progress_percentage=excluded.progress_percentage, last_read_at=clock_timestamp(),
                position_session_at=excluded.position_session_at,
                position_session_id=excluded.position_session_id, position_sequence=excluded.position_sequence
            WHERE (h.position_session_at,h.position_session_id,h.position_sequence)
                < (excluded.position_session_at,excluded.position_session_id,excluded.position_sequence);
        WHEN 'begin_page' THEN
            IF v_page IS NULL THEN RETURN '{"error":"invalid_action"}'::jsonb; END IF;
            UPDATE pojok_baca.reader_page_visits SET ended_at = clock_timestamp()
            WHERE session_id = p_session AND ended_at IS NULL;
            INSERT INTO pojok_baca.reader_page_visits(session_id, page_number)
            VALUES (p_session, v_page) RETURNING id INTO v_visit;
            RETURN jsonb_build_object('ok', true, 'visit', v_visit);
        WHEN 'favorite_anchor' THEN
            IF p_enabled IS NULL THEN RETURN '{"error":"invalid_action"}'::jsonb; END IF;
            IF p_enabled THEN
                INSERT INTO pojok_baca.favorite_pages(user_id, edition_id, page_number, paragraph_index)
                VALUES (p_user, s.edition_id, v_page, v_paragraph) ON CONFLICT DO NOTHING;
            ELSE
                DELETE FROM pojok_baca.favorite_pages WHERE user_id = p_user AND edition_id = s.edition_id
                    AND page_number IS NOT DISTINCT FROM v_page AND paragraph_index IS NOT DISTINCT FROM v_paragraph;
            END IF;
        WHEN 'quote' THEN
            v_quote := btrim(coalesce(nullif(btrim(v_source), ''), p_text, ''));
            IF v_paragraph IS NOT NULL THEN
                v_quote := btrim(coalesce(p_text, ''));
                IF v_quote = '' OR strpos(v_source, v_quote) = 0 THEN RETURN '{"error":"invalid_quote"}'::jsonb; END IF;
            END IF;
            IF v_quote = '' THEN RETURN '{"error":"invalid_quote"}'::jsonb; END IF;
            INSERT INTO pojok_baca.quotes(user_id, book_id, edition_id, page_number, paragraph_index, quote_text, is_public)
            VALUES (p_user, s.book_id, s.edition_id, v_page, v_paragraph, left(v_quote, 2000), false);
        ELSE RETURN '{"error":"invalid_action"}'::jsonb;
    END CASE;
    RETURN '{"ok":true}'::jsonb;
END;
$$;

REVOKE EXECUTE ON FUNCTION pojok_baca.open_private_reader(uuid,text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pojok_baca.private_reader_asset(uuid,uuid,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pojok_baca.reader_action(uuid,uuid,text,integer,integer,uuid,boolean,text) FROM PUBLIC;
COMMIT;
