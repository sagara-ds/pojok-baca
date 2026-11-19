import { isAdult, isPublicSlug } from '../services/curation';
import type { Book } from '../services/types';
import { getDatabase } from './database';
import { toPublicReader } from './public-readers';

export interface CatalogBook extends Book {
  categories: string[];
  bookType: 'webp_sheets' | 'novel_text';
  recommended: boolean;
  weeklyReaders: number;
  detailViews: number;
  publicQuotes: number;
}

type CatalogRow = {
  id: string;
  slug: string;
  title: string;
  author: string;
  cover_url: string | null;
  synopsis: string;
  categories: string[];
  total_pages: number | null;
  total_paragraphs: number | null;
  detail_views: string;
  unique_readers: string;
  book_type: CatalogBook['bookType'];
  is_recommended: boolean;
  weekly_readers: string;
  public_quotes: string;
};

const publicSelection = `
  SELECT c.id, c.slug, c.title, c.author, c.cover_url, c.synopsis, c.categories,
         c.total_pages, c.total_paragraphs, c.book_type, c.is_recommended,
         a.detail_views, a.unique_readers, e.weekly_readers, e.public_quotes
  FROM pojok_baca.current_book_catalog c
  JOIN pojok_baca.public_book_activity a ON a.book_id = c.id
  JOIN pojok_baca.public_editorial_counts e ON e.book_id = c.id
  WHERE c.status = 'published' AND c.current_edition_id IS NOT NULL
`;

function toBook(row: CatalogRow): CatalogBook {
  const cover = row.cover_url ?? '';
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    author: row.author,
    coverUrl: /^\/covers\/[a-z0-9-]+\.webp$|^https:\/\//i.test(cover) ? cover : '',
    description: row.synopsis,
    category: row.categories[0] ?? '',
    categories: row.categories,
    pages: row.total_pages ?? 0,
    language: 'id',
    readingUrl: `/read/${row.slug}/`,
    hasTextLayer: (row.total_paragraphs ?? 0) > 0,
    readCount: Number(row.unique_readers),
    bookType: row.book_type,
    recommended: row.is_recommended,
    weeklyReaders: Number(row.weekly_readers),
    detailViews: Number(row.detail_views),
    publicQuotes: Number(row.public_quotes),
  };
}

export async function activeReadersToday() {
  const sql = getDatabase();
  const [row] = await sql`SELECT readers FROM pojok_baca.public_readers_today`;
  return Number(row.readers);
}

export async function listPublicQuotes(bookId: string) {
  const sql = getDatabase();
  const rows = await sql`SELECT quote_text FROM pojok_baca.public_book_quotes(${bookId}::bigint)`;
  return rows.map((row) => String(row.quote_text));
}

export async function listPublicBooks(): Promise<CatalogBook[]> {
  const sql = getDatabase();
  const rows = await sql.query(publicSelection + ' ORDER BY c.created_at DESC, c.id DESC');
  return (rows as CatalogRow[]).filter((row) => isPublicSlug(row.slug)).map(toBook);
}

export async function findPublicBook(slug: string) {
  if (!isPublicSlug(slug)) return null;
  const sql = getDatabase();
  const rows = await sql.query(publicSelection + ' AND c.slug = $1', [slug]);
  const row = rows[0] as CatalogRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    book: toBook(row),
    detailViews: Number(row.detail_views),
  };
}

export async function recordDetailView(userId: string, bookId: string) {
  const sql = getDatabase();
  const [, rows] = await sql.transaction([
    sql`SELECT pojok_baca.record_detail_view(${userId}::uuid, ${bookId}::bigint)`,
    sql`SELECT detail_views FROM pojok_baca.public_book_activity WHERE book_id = ${bookId}::bigint`,
  ]);
  return Number(rows[0]?.detail_views ?? 0);
}

export async function listRecentReaders(bookId: string) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT name, class_name, read_at FROM pojok_baca.recent_public_readers(${bookId}::bigint)
  `;
  const now = new Date();
  return rows.map((row) => toPublicReader({
    name: row.name,
    className: row.class_name,
    readAt: new Date(row.read_at),
  }, now));
}

export async function listAdminCatalog() {
  const sql = getDatabase();
  const rows = await sql`
    SELECT slug, title, author, status, book_type, is_recommended
    FROM pojok_baca.current_book_catalog
    ORDER BY (status = 'draft') DESC, title
  `;
  return rows.filter((row) => !isAdult(row.slug)) as {
    slug: string; title: string; author: string; status: string; book_type: string | null; is_recommended: boolean;
  }[];
}
