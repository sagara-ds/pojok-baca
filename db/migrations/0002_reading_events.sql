BEGIN;

-- Use this within the same transaction that changes the current edition.
-- A false result means another publish/archive operation owns the lock.
CREATE FUNCTION pojok_baca.try_lock_book_finalization(p_book_id bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE STRICT
SET search_path = pg_catalog, pg_temp
RETURN pg_try_advisory_xact_lock(hashtextextended('pojok_baca:finalize:' || p_book_id, 0));

CREATE FUNCTION pojok_baca.report_today_wib()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
RETURN (now() AT TIME ZONE 'Asia/Jakarta')::date;

-- Keep the lookup and write serialized per user, book and event type.
-- Run the event entry points at PostgreSQL's default READ COMMITTED isolation.
CREATE FUNCTION pojok_baca.record_book_view(
    p_user_id uuid, p_book_id bigint, p_event_type text
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_now timestamptz;
    v_id bigint;
    v_created_at timestamptz;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'pojok_baca:view:' || p_user_id || ':' || p_book_id || ':' || p_event_type, 0
    ));
    v_now := clock_timestamp();

    SELECT id, created_at INTO v_id, v_created_at
    FROM pojok_baca.book_views
    WHERE user_id = p_user_id AND book_id = p_book_id AND event_type = p_event_type
    ORDER BY created_at DESC, id DESC LIMIT 1;

    IF FOUND AND v_now < v_created_at + interval '30 minutes' THEN
        UPDATE pojok_baca.book_views SET updated_at = greatest(updated_at, v_now) WHERE id = v_id;
        RETURN v_id;
    END IF;

    INSERT INTO pojok_baca.book_views (user_id, book_id, event_type, created_at, updated_at)
    VALUES (p_user_id, p_book_id, p_event_type, v_now, v_now)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE FUNCTION pojok_baca.record_detail_view(p_user_id uuid, p_book_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    PERFORM 1
    FROM public.users u CROSS JOIN pojok_baca.books b
    WHERE u.user_id = p_user_id AND u.is_active AND u.class_name IS NOT NULL
      AND b.id = p_book_id AND b.status = 'published'
    FOR SHARE OF u, b;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    RETURN pojok_baca.record_book_view(p_user_id, p_book_id, 'detail_view');
END;
$$;

CREATE FUNCTION pojok_baca.confirm_read_session(p_user_id uuid, p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_session record;
    v_now timestamptz;
BEGIN
    SELECT s.started_at, s.confirmed_at, e.book_id INTO v_session
    FROM pojok_baca.reader_sessions s
    JOIN pojok_baca.book_editions e ON e.id = s.edition_id
    JOIN pojok_baca.books b ON b.id = e.book_id AND b.current_edition_id = e.id
    JOIN public.users u ON u.user_id = s.user_id
    WHERE s.id = p_session_id AND u.user_id = p_user_id AND u.is_active AND u.class_name IS NOT NULL
      AND b.status = 'published' AND e.state = 'ready'
    FOR UPDATE OF s FOR SHARE OF b, e, u;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    IF v_session.confirmed_at IS NOT NULL THEN
        RETURN true;
    END IF;

    v_now := clock_timestamp();
    IF v_now < v_session.started_at + interval '15 seconds'
       OR v_now >= v_session.started_at + interval '30 minutes' THEN
        RETURN false;
    END IF;
    PERFORM pojok_baca.record_book_view(p_user_id, v_session.book_id, 'read_session');
    UPDATE pojok_baca.reader_sessions SET confirmed_at = v_now WHERE id = p_session_id;
    RETURN true;
END;
$$;

-- Grant the runtime role only the entry points it needs. Never grant record_book_view
-- directly. Identity arguments come from the verified server session.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pojok_baca FROM PUBLIC;

COMMIT;
