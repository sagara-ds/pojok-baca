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

/**
 * Daftar buku + paginasi + filter kategori/sort (dari manifest pipeline)
 */
export async function fetchBooks(params: SearchParams = {}): Promise<BookListResponse> {
  let books = getAllBooks();

  if (params.q) {
    const q = params.q.trim().toLowerCase();
    books = books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }
  if (params.category) {
    books = books.filter((b) => b.category === params.category);
  }
  if (params.year) {
    books = books.filter((b) => b.publishedYear === params.year);
  }

  const sorters: Record<string, (a: Book, b: Book) => number> = {
    'title-asc': (a, b) => a.title.localeCompare(b.title, 'id'),
    'title-desc': (a, b) => b.title.localeCompare(a.title, 'id'),
    newest: (a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0),
    oldest: (a, b) => (a.publishedYear ?? 0) - (b.publishedYear ?? 0),
    popular: (a, b) => b.pages - a.pages,
  };
  const sorter = params.sort ? sorters[params.sort] : undefined;
  if (sorter) books = [...books].sort(sorter);

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
 * Pencarian buku berdasarkan judul/penulis (dari manifest pipeline)
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
