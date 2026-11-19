BEGIN;

CREATE SCHEMA pojok_baca;
REVOKE ALL ON SCHEMA pojok_baca FROM PUBLIC;

CREATE TABLE public.users (
    user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    class_name text CHECK (class_name ~ '[^[:space:]]'),
    nisn text UNIQUE CHECK (nisn ~ '^[0-9]{10}$'),
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    is_active boolean NOT NULL DEFAULT true,
    show_in_public_readers boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (role <> 'user' OR class_name IS NOT NULL),
    CHECK (updated_at >= created_at)
);

REVOKE ALL ON TABLE public.users FROM PUBLIC;

-- The account provider owns email, credentials and sessions.
CREATE TABLE pojok_baca.books (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title text NOT NULL CHECK (btrim(title) <> ''),
    author text NOT NULL CHECK (btrim(author) <> ''),
    categories text[] NOT NULL DEFAULT '{}',
    synopsis text NOT NULL DEFAULT '',
    cover_url text,
    is_recommended boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    current_edition_id uuid,
    current_edition_state text GENERATED ALWAYS AS ('ready'::text) STORED,
    created_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'published' OR current_edition_id IS NOT NULL),
    CHECK (updated_at >= created_at)
);

-- A replacement gets fresh keys. Historical positions keep their original edition.
CREATE TABLE pojok_baca.book_editions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id bigint NOT NULL REFERENCES pojok_baca.books(id) ON DELETE RESTRICT,
    book_type text NOT NULL CHECK (book_type IN ('webp_sheets', 'novel_text')),
    total_pages integer NOT NULL DEFAULT 0 CHECK (total_pages >= 0),
    total_paragraphs integer NOT NULL DEFAULT 0 CHECK (total_paragraphs >= 0),
    storage_kind text NOT NULL CHECK (storage_kind IN ('legacy_strips', 'r2_webp', 'database')),
    r2_folder_path text UNIQUE,
    legacy_page_index_path text,
    state text NOT NULL DEFAULT 'staging'
        CHECK (state IN ('staging', 'ready', 'cleanup_pending', 'removed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (book_id, id),
    UNIQUE (book_id, id, state),
    CHECK (
        (book_type = 'webp_sheets' AND total_pages > 0 AND storage_kind IN ('legacy_strips', 'r2_webp'))
        OR (book_type = 'novel_text' AND storage_kind = 'database' AND total_pages = 0)
    ),
    CHECK ((storage_kind = 'r2_webp') = (r2_folder_path IS NOT NULL)),
    CHECK ((storage_kind = 'legacy_strips') = (legacy_page_index_path IS NOT NULL)),
    CHECK (r2_folder_path IS NULL OR r2_folder_path = 'sheets/' || id::text),
    CHECK (book_type <> 'novel_text' OR state <> 'ready' OR total_paragraphs > 0)
);

ALTER TABLE pojok_baca.books ADD CONSTRAINT books_current_edition_fk
    FOREIGN KEY (id, current_edition_id, current_edition_state)
    REFERENCES pojok_baca.book_editions(book_id, id, state);

CREATE INDEX books_published_recommended_idx ON pojok_baca.books (created_at DESC, id)
    WHERE status = 'published' AND is_recommended;
CREATE INDEX books_categories_idx ON pojok_baca.books USING gin (categories);
CREATE INDEX book_editions_cleanup_idx ON pojok_baca.book_editions (created_at)
    WHERE state = 'cleanup_pending';

CREATE TABLE pojok_baca.book_pages (
    edition_id uuid NOT NULL REFERENCES pojok_baca.book_editions(id) ON DELETE RESTRICT,
    page_number integer NOT NULL CHECK (page_number > 0),
    extracted_text text,
    -- For R2, insert only after the Worker confirms a successful object write.
    asset_ready_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (edition_id, page_number)
);

CREATE TABLE pojok_baca.novel_chapters (
    edition_id uuid NOT NULL REFERENCES pojok_baca.book_editions(id) ON DELETE RESTRICT,
    chapter_index integer NOT NULL CHECK (chapter_index >= 0),
    title text,
    PRIMARY KEY (edition_id, chapter_index)
);

CREATE TABLE pojok_baca.novel_paragraphs (
    edition_id uuid NOT NULL,
    paragraph_index integer NOT NULL CHECK (paragraph_index >= 0),
    chapter_index integer NOT NULL,
    body text NOT NULL CHECK (btrim(body) <> ''),
    PRIMARY KEY (edition_id, paragraph_index),
    FOREIGN KEY (edition_id, chapter_index)
        REFERENCES pojok_baca.novel_chapters(edition_id, chapter_index) ON DELETE RESTRICT
);

CREATE INDEX novel_paragraphs_chapter_idx
    ON pojok_baca.novel_paragraphs (edition_id, chapter_index, paragraph_index);

CREATE TABLE pojok_baca.reader_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    edition_id uuid NOT NULL REFERENCES pojok_baca.book_editions(id) ON DELETE RESTRICT,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    confirmed_at timestamptz,
    UNIQUE (id, user_id, edition_id),
    CHECK (confirmed_at IS NULL OR confirmed_at >= started_at + interval '15 seconds')
);

CREATE INDEX reader_sessions_user_idx ON pojok_baca.reader_sessions (user_id, started_at DESC);

CREATE TABLE pojok_baca.book_views (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    book_id bigint NOT NULL REFERENCES pojok_baca.books(id) ON DELETE RESTRICT,
    event_type text NOT NULL CHECK (event_type IN ('detail_view', 'read_session')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (updated_at >= created_at)
);

CREATE INDEX book_views_cooldown_idx
    ON pojok_baca.book_views (user_id, book_id, event_type, created_at DESC, id DESC);
CREATE INDEX book_views_book_idx
    ON pojok_baca.book_views (book_id, event_type, created_at DESC, user_id);
CREATE INDEX book_views_recent_idx
    ON pojok_baca.book_views (created_at DESC, book_id, user_id) WHERE event_type = 'read_session';

CREATE TABLE pojok_baca.reading_histories (
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    book_id bigint NOT NULL,
    edition_id uuid NOT NULL,
    last_page integer,
    last_paragraph_index integer,
    progress_percentage numeric(5, 2) NOT NULL CHECK (progress_percentage BETWEEN 0 AND 100),
    last_read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (user_id, book_id),
    FOREIGN KEY (book_id, edition_id) REFERENCES pojok_baca.book_editions(book_id, id),
    FOREIGN KEY (edition_id, last_page) REFERENCES pojok_baca.book_pages(edition_id, page_number),
    FOREIGN KEY (edition_id, last_paragraph_index)
        REFERENCES pojok_baca.novel_paragraphs(edition_id, paragraph_index),
    CHECK (num_nonnulls(last_page, last_paragraph_index) = 1)
);

CREATE INDEX reading_histories_recent_idx ON pojok_baca.reading_histories (user_id, last_read_at DESC);

-- Evidence for official page totals. Position changes never create this row on their own.
CREATE TABLE pojok_baca.reading_page_reads (
    user_id uuid NOT NULL,
    edition_id uuid NOT NULL,
    page_number integer NOT NULL,
    session_id uuid NOT NULL,
    qualified_at timestamptz NOT NULL DEFAULT now(),
    -- Keep the recorded day's key stable on replay and across connection time zones.
    read_on date GENERATED ALWAYS AS ((qualified_at AT TIME ZONE 'Asia/Jakarta')::date) STORED,
    PRIMARY KEY (user_id, edition_id, page_number, read_on),
    FOREIGN KEY (session_id, user_id, edition_id)
        REFERENCES pojok_baca.reader_sessions(id, user_id, edition_id) ON DELETE RESTRICT,
    FOREIGN KEY (edition_id, page_number) REFERENCES pojok_baca.book_pages(edition_id, page_number)
);

CREATE INDEX reading_page_reads_report_idx ON pojok_baca.reading_page_reads (read_on, user_id);

CREATE TABLE pojok_baca.favorite_books (
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    book_id bigint NOT NULL REFERENCES pojok_baca.books(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
);

CREATE TABLE pojok_baca.favorite_pages (
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    edition_id uuid NOT NULL,
    page_number integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, edition_id, page_number),
    FOREIGN KEY (edition_id, page_number) REFERENCES pojok_baca.book_pages(edition_id, page_number)
);

CREATE TABLE pojok_baca.quotes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    book_id bigint NOT NULL,
    edition_id uuid NOT NULL,
    page_number integer,
    paragraph_index integer,
    quote_text text NOT NULL CHECK (char_length(btrim(quote_text)) BETWEEN 1 AND 2000),
    is_public boolean NOT NULL DEFAULT false,
    moderation_status text NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (book_id, edition_id) REFERENCES pojok_baca.book_editions(book_id, id),
    FOREIGN KEY (edition_id, page_number) REFERENCES pojok_baca.book_pages(edition_id, page_number),
    FOREIGN KEY (edition_id, paragraph_index)
        REFERENCES pojok_baca.novel_paragraphs(edition_id, paragraph_index),
    CHECK (num_nonnulls(page_number, paragraph_index) = 1)
);

CREATE INDEX quotes_owner_idx ON pojok_baca.quotes (user_id, created_at DESC);
CREATE INDEX quotes_public_idx ON pojok_baca.quotes (book_id, created_at DESC)
    WHERE is_public AND moderation_status = 'approved';

CREATE TABLE pojok_baca.quote_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_id bigint NOT NULL REFERENCES pojok_baca.quotes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
    moderation_status text NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quote_comments_quote_idx ON pojok_baca.quote_comments (quote_id, created_at);

CREATE TABLE pojok_baca.admin_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]*$'),
    target_info jsonb NOT NULL CHECK (jsonb_typeof(target_info) = 'object'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX admin_audit_logs_recent_idx ON pojok_baca.admin_audit_logs (created_at DESC, id DESC);
CREATE INDEX admin_audit_logs_admin_idx ON pojok_baca.admin_audit_logs (admin_id, created_at DESC);

-- Catalog shape for a future server repository. Do not expose storage keys in public JSON.
CREATE VIEW pojok_baca.current_book_catalog AS
SELECT b.id, b.uuid, b.slug, b.title, b.author, b.categories, b.synopsis, b.cover_url,
       b.is_recommended, b.status, b.current_edition_id, b.created_by, b.created_at, b.updated_at,
       e.book_type, e.total_pages, e.total_paragraphs, e.storage_kind,
       e.r2_folder_path, e.legacy_page_index_path
FROM pojok_baca.books b
LEFT JOIN pojok_baca.book_editions e ON e.id = b.current_edition_id;

COMMIT;
