/**
 * Data service — sumber data tunggal: katalog lokal dari pipeline
 * (`data/books.json`, hasil `npm run pipe:manifest`).
 *
 * TIDAK ada permintaan jaringan di modul ini. Antarmuka (fetchBooks/fetchBook/
 * searchBooks/fetchCategories) sengaja dipertahankan agar pages tidak perlu
 * berubah. formerly mock-data.ts, sekarang digantikan koleksi buku asli.
 */

import type { Book, BookListResponse, SearchParams, Category } from './types';
import { getAllBooks, getBook, getCategories, searchBooksLocal } from './books';

/**
 * Sanitize HTML content — utility teks lokal (tanpa koneksi ke pihak ketiga)
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Basic sanitization - replace with DOMPurify in production
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim();
}

/**
 * Sanitize plain text (strip all HTML)
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .trim();
}

/**
 * Detail satu buku berdasarkan slug (dari manifest pipeline)
 */
export async function fetchBook(slug: string): Promise<Book | null> {
  return getBook(slug);
}

export interface FetchBooksOptions {
  /** Peta slug -> jumlah pembaca (dari statistik). Dipakai sort=popular. */
  readCounts?: Record<string, number>;
}

/**
 * Daftar buku + paginasi + filter kategori/sort (dari manifest pipeline).
 *
 * Pencarian mencakup judul, penulis, sinopsis, dan kategori (Opsi A).
 */
export async function fetchBooks(
  params: SearchParams = {},
  options: FetchBooksOptions = {},
): Promise<BookListResponse> {
  let books = params.q ? searchBooksLocal(params.q) : getAllBooks();

  if (params.category) {
    books = books.filter((b) => b.category === params.category);
  }
  if (params.year) {
    books = books.filter((b) => b.publishedYear === params.year);
  }

  const readCounts = options.readCounts ?? {};

  const sorters: Record<string, (a: Book, b: Book) => number> = {
    'title-asc': (a, b) => a.title.localeCompare(b.title, 'id'),
    'title-desc': (a, b) => b.title.localeCompare(a.title, 'id'),
    newest: (a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0),
    oldest: (a, b) => (a.publishedYear ?? 0) - (b.publishedYear ?? 0),
    // "Populer" HARUS berarti jumlah pembaca, bukan jumlah halaman.
    // Tanpa data statistik, urutan jatuh ke judul supaya deterministik.
    popular: (a, b) =>
      (readCounts[b.slug] ?? 0) - (readCounts[a.slug] ?? 0) ||
      a.title.localeCompare(b.title, 'id'),
  };
  const sorter = params.sort ? sorters[params.sort] : undefined;
  if (sorter) books = [...books].sort(sorter);

  // Lampirkan jumlah pembaca kalau tersedia.
  if (Object.keys(readCounts).length > 0) {
    books = books.map((b) => ({ ...b, readCount: readCounts[b.slug] ?? 0 }));
  }

  const total = books.length;
  const limit = params.limit ?? 12;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);
  const start = (page - 1) * limit;

  return {
    data: books.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Pencarian buku berdasarkan judul/penulis/sinopsis/kategori.
 */
export async function searchBooks(query: string, params: Omit<SearchParams, 'q'> = {}): Promise<BookListResponse> {
  const limit = params.limit ?? 12;
  const all = searchBooksLocal(query);
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);
  const start = (page - 1) * limit;

  return {
    data: all.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Daftar kategori (dari manifest pipeline)
 */
export async function fetchCategories(): Promise<Category[]> {
  return getCategories();
}
