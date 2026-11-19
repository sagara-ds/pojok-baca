BEGIN;

ALTER TABLE pojok_baca.book_editions
    ADD COLUMN upload_source_hash text CHECK (upload_source_hash ~ '^[0-9a-f]{64}$'),
    ADD COLUMN upload_expires_at timestamptz;
CREATE UNIQUE INDEX book_editions_one_staging ON pojok_baca.book_editions(book_id) WHERE state='staging';
CREATE INDEX book_pages_asset_key_idx ON pojok_baca.book_pages(asset_key) WHERE asset_key IS NOT NULL;

CREATE FUNCTION pojok_baca.is_catalog_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
RETURN EXISTS (
    SELECT FROM public.users WHERE user_id = p_user AND is_active AND class_name IS NOT NULL
      AND role IN ('admin','super_admin')
);

CREATE FUNCTION pojok_baca.edition_webp_key(p_edition uuid, p_page integer)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
RETURN 'sheets/' || p_edition::text || '/b' || lpad(p_page::text, greatest(3,length(p_page::text)), '0') || '.webp';

CREATE FUNCTION pojok_baca.admin_start_edition(
    p_user uuid, p_existing text, p_slug text, p_title text, p_author text,
    p_synopsis text, p_categories text[], p_pages integer, p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_book bigint;
    v_edition uuid;
    v_staging record;
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) THEN RETURN '{"error":"forbidden"}'::jsonb; END IF;
    IF p_pages IS NULL OR p_pages NOT BETWEEN 1 AND 5000
       OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RETURN '{"error":"invalid_pdf"}'::jsonb; END IF;

    IF p_existing IS NULL THEN
        INSERT INTO pojok_baca.books(slug,title,author,synopsis,categories,created_by)
        VALUES(p_slug,p_title,p_author,p_synopsis,p_categories,p_user)
        ON CONFLICT(slug) DO NOTHING RETURNING id INTO v_book;
        IF v_book IS NULL THEN
            SELECT id INTO v_book FROM pojok_baca.books
            WHERE slug=p_slug AND status='draft' AND current_edition_id IS NULL AND created_by=p_user
            FOR UPDATE;
            IF v_book IS NULL THEN RETURN '{"error":"slug_taken"}'::jsonb; END IF;
        ELSE
            INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
            VALUES(p_user,'CREATE_BOOK',jsonb_build_object('bookId',v_book));
        END IF;
    ELSE
        SELECT id INTO v_book FROM pojok_baca.books WHERE slug=p_existing AND status <> 'archived' FOR UPDATE;
        IF v_book IS NULL THEN RETURN '{"error":"book_not_found"}'::jsonb; END IF;
    END IF;

    SELECT id,total_pages,upload_source_hash INTO v_staging
    FROM pojok_baca.book_editions WHERE book_id=v_book AND state='staging' FOR UPDATE;
    IF FOUND THEN
        IF v_staging.total_pages <> p_pages OR v_staging.upload_source_hash IS DISTINCT FROM p_hash THEN
            RETURN '{"error":"staging_exists"}'::jsonb;
        END IF;
        v_edition := v_staging.id;
    ELSE
        v_edition := gen_random_uuid();
        INSERT INTO pojok_baca.book_editions(id,book_id,book_type,total_pages,storage_kind,r2_folder_path,upload_source_hash)
        VALUES(v_edition,v_book,'webp_sheets',p_pages,'r2_webp','sheets/' || v_edition::text,p_hash);
        INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
        VALUES(p_user,'START_EDITION_UPLOAD',jsonb_build_object('bookId',v_book,'edition',v_edition,'pages',p_pages));
    END IF;
    RETURN jsonb_build_object('edition',v_edition,'confirmed',coalesce((
        SELECT jsonb_agg(page_number ORDER BY page_number)
        FROM pojok_baca.book_pages WHERE edition_id=v_edition
    ),'[]'::jsonb));
END;
$$;

CREATE FUNCTION pojok_baca.admin_upload_key(p_user uuid,p_edition uuid,p_page integer,p_lease integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) OR p_lease IS NULL OR p_lease NOT BETWEEN 0 AND 180 THEN
        RETURN NULL;
    END IF;
    PERFORM 1 FROM pojok_baca.book_editions
    WHERE id=p_edition AND state='staging' AND storage_kind='r2_webp' AND p_page BETWEEN 1 AND total_pages
    FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_lease > 0 THEN
        UPDATE pojok_baca.book_editions
        SET upload_expires_at=greatest(upload_expires_at,clock_timestamp()+make_interval(secs => p_lease))
        WHERE id=p_edition;
    END IF;
    RETURN pojok_baca.edition_webp_key(p_edition,p_page);
END;
$$;

CREATE FUNCTION pojok_baca.admin_confirm_page(p_user uuid,p_edition uuid,p_page integer,p_text text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_key text := pojok_baca.admin_upload_key(p_user,p_edition,p_page,0);
BEGIN
    IF v_key IS NULL THEN RETURN false; END IF;
    INSERT INTO pojok_baca.book_pages(edition_id,page_number,asset_key,extracted_text)
    VALUES(p_edition,p_page,v_key,nullif(btrim(left(p_text,30000)),''))
    ON CONFLICT (edition_id,page_number) DO NOTHING;
    RETURN true;
END;
$$;

CREATE FUNCTION pojok_baca.admin_finalize_edition(p_user uuid,p_edition uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_book bigint;
    v_previous uuid;
    v_edition record;
    v_slug text;
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) THEN RETURN '{"error":"forbidden"}'::jsonb; END IF;
    SELECT book_id INTO v_book FROM pojok_baca.book_editions WHERE id=p_edition;
    IF v_book IS NULL THEN RETURN '{"error":"edition_not_found"}'::jsonb; END IF;
    IF NOT pojok_baca.try_lock_book_finalization(v_book) THEN RETURN '{"error":"edition_busy"}'::jsonb; END IF;
    SELECT current_edition_id,slug INTO v_previous,v_slug FROM pojok_baca.books
    WHERE id=v_book AND status <> 'archived' FOR UPDATE;
    IF NOT FOUND THEN RETURN '{"error":"book_not_found"}'::jsonb; END IF;
    IF v_previous=p_edition THEN
        RETURN jsonb_build_object('slug',v_slug,'cleanup',coalesce((
            SELECT jsonb_agg(id) FROM pojok_baca.book_editions WHERE book_id=v_book AND state='cleanup_pending'
        ),'[]'::jsonb));
    END IF;
    SELECT state,total_pages INTO v_edition FROM pojok_baca.book_editions WHERE id=p_edition FOR UPDATE;
    IF v_edition.state <> 'staging' THEN RETURN '{"error":"edition_not_staging"}'::jsonb; END IF;

    IF EXISTS (
        SELECT FROM generate_series(1,v_edition.total_pages) AS needed(page)
        WHERE NOT EXISTS (
            SELECT FROM pojok_baca.book_pages p
            WHERE p.edition_id=p_edition AND p.page_number=needed.page
              AND p.asset_key=pojok_baca.edition_webp_key(p_edition,needed.page)
        )
    ) THEN RETURN '{"error":"incomplete_edition"}'::jsonb; END IF;

    UPDATE pojok_baca.book_editions SET state='ready' WHERE id=p_edition;
    UPDATE pojok_baca.books SET status='published',current_edition_id=p_edition,updated_at=clock_timestamp() WHERE id=v_book;
    IF v_previous IS NOT NULL THEN
        UPDATE pojok_baca.book_editions SET state='cleanup_pending' WHERE id=v_previous;
    END IF;
    INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
    VALUES(p_user,'PUBLISH_EDITION',jsonb_build_object('bookId',v_book,'edition',p_edition,'previous',v_previous));
    RETURN jsonb_build_object('slug',v_slug,'cleanup',coalesce((
        SELECT jsonb_agg(id) FROM pojok_baca.book_editions WHERE book_id=v_book AND state='cleanup_pending'
    ),'[]'::jsonb));
END;
$$;

CREATE FUNCTION pojok_baca.admin_cancel_edition(p_user uuid,p_edition uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) THEN RETURN false; END IF;
    UPDATE pojok_baca.book_editions SET state='cleanup_pending' WHERE id=p_edition AND state='staging';
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
    VALUES(p_user,'CANCEL_EDITION',jsonb_build_object('edition',p_edition));
    RETURN true;
END;
$$;

CREATE FUNCTION pojok_baca.admin_cleanup_keys(p_user uuid,p_edition uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_edition record;
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) THEN RETURN '{"error":"forbidden"}'::jsonb; END IF;
    SELECT state,storage_kind,total_pages,upload_expires_at INTO v_edition
    FROM pojok_baca.book_editions WHERE id=p_edition;
    IF NOT FOUND THEN RETURN '{"error":"edition_not_found"}'::jsonb; END IF;
    IF v_edition.state='removed' THEN RETURN '{"done":true}'::jsonb; END IF;
    IF v_edition.state <> 'cleanup_pending' THEN RETURN '{"error":"edition_not_pending"}'::jsonb; END IF;
    IF v_edition.upload_expires_at > clock_timestamp() THEN
        RETURN jsonb_build_object('retryAt',v_edition.upload_expires_at);
    END IF;
    RETURN jsonb_build_object('keys',coalesce((
        SELECT jsonb_agg(k.key) FROM (
            SELECT pojok_baca.edition_webp_key(p_edition,n) AS key
            FROM generate_series(1,v_edition.total_pages) n WHERE v_edition.storage_kind='r2_webp'
            UNION
            SELECT p.asset_key FROM pojok_baca.book_pages p
            WHERE p.edition_id=p_edition AND p.asset_key IS NOT NULL
        ) k WHERE NOT EXISTS (
            SELECT FROM pojok_baca.book_pages p JOIN pojok_baca.book_editions e ON e.id=p.edition_id
            WHERE p.asset_key=k.key AND e.state IN ('ready','staging')
        )
    ),'[]'::jsonb));
END;
$$;

CREATE FUNCTION pojok_baca.admin_finish_cleanup(p_user uuid,p_edition uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT pojok_baca.is_catalog_admin(p_user) THEN RETURN false; END IF;
    UPDATE pojok_baca.book_editions SET state='removed' WHERE id=p_edition AND state='cleanup_pending'
        AND (upload_expires_at IS NULL OR upload_expires_at <= clock_timestamp());
    IF FOUND THEN
        INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
        VALUES(p_user,'CLEANUP_EDITION',jsonb_build_object('edition',p_edition));
        RETURN true;
    END IF;
    RETURN EXISTS (SELECT FROM pojok_baca.book_editions WHERE id=p_edition AND state='removed');
END;
$$;

CREATE FUNCTION pojok_baca.admin_uploads(p_user uuid)
RETURNS TABLE (edition uuid,slug text,title text,state text,ready_pages bigint,total_pages integer,retry_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT e.id,b.slug,b.title,e.state,
        (SELECT count(*) FROM pojok_baca.book_pages p WHERE p.edition_id=e.id),
        e.total_pages,e.upload_expires_at
    FROM pojok_baca.book_editions e JOIN pojok_baca.books b ON b.id=e.book_id
    WHERE pojok_baca.is_catalog_admin(p_user) AND e.state IN ('staging','cleanup_pending')
    ORDER BY e.created_at DESC;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pojok_baca FROM PUBLIC;
COMMIT;
