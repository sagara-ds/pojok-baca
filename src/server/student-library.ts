import { getDatabase } from './database';
import { isPublicSlug } from '../services/curation';

export interface ReadingPosition { page: number | null; paragraph: number | null }
type LibraryBook = { slug: string; title: string; author: string; cover_url: string | null; archived: boolean };
export type LibraryData = {
  history: (LibraryBook & ReadingPosition & { progress: number })[];
  books: LibraryBook[];
  anchors: (Pick<LibraryBook, 'slug'|'title'|'archived'> & ReadingPosition & { edition: string })[];
  quotes: { id: string; slug: string; title: string; text: string; public: boolean; moderation: 'pending'|'approved'|'rejected' }[];
};

export const libraryTabs = [
  ['history', 'Riwayat baca'], ['books', 'Buku favorit'],
  ['anchors', 'Halaman & paragraf'], ['quotes', 'Kutipan saya'],
] as const;

export function libraryTab(value: string | null) {
  return libraryTabs.find(([key]) => key === value)?.[0] ?? 'history';
}

export function readingHref(slug: string, position?: ReadingPosition | null) {
  const href = `/read/${encodeURIComponent(slug)}/`;
  if (position?.paragraph != null) return href + `?mode=text&paragraph=${position.paragraph}`;
  if (position?.page != null) return href + `?mode=page&p=${position.page}`;
  return href;
}

export async function getReadingPosition(userId: string, bookId: string) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.library_position(${userId}::uuid,${bookId}::bigint) AS position`;
  return row.position as ReadingPosition | null;
}

export async function getStudentLibrary(userId: string) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.student_library(${userId}::uuid) AS data`;
  const data = row.data as LibraryData | null;
  if (data) {
    data.history = data.history.filter((book) => isPublicSlug(book.slug));
    data.books = data.books.filter((book) => isPublicSlug(book.slug));
    data.anchors = data.anchors.filter((book) => isPublicSlug(book.slug));
  }
  return data;
}
