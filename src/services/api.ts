/**
 * Data service — sumber data tunggal: katalog lokal (src/services/mock-data.ts)
 *
 * TIDAK ada permintaan jaringan di modul ini: semua buku, kategori, dan cover
 * digenerate/dideklarasikan lokal. Antarmuka (fetchBooks/fetchBook/searchBooks/
 * fetchCategories) sengaja dipertahankan agar pages tidak perlu berubah bila
 * kelak ditukar ke backend/data lokal lain (mis. koleksi file buku sendiri).
 */

import type { Book, BookListResponse, SearchParams, Category } from './types';
import { getMockBooks, getMockBook, searchMockBooks, mockCategories } from './mock-data';

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
 * Detail satu buku berdasarkan slug (dari sumber lokal)
 */
export async function fetchBook(slug: string): Promise<Book | null> {
  return getMockBook(slug);
}

/**
 * Daftar buku + paginasi + filter kategori/sort (dari sumber lokal)
 */
export async function fetchBooks(params: SearchParams = {}): Promise<BookListResponse> {
  return getMockBooks({ ...params });
}

/**
 * Pencarian buku berdasarkan judul/penulis (dari sumber lokal)
 */
export async function searchBooks(query: string, params: Omit<SearchParams, 'q'> = {}): Promise<BookListResponse> {
  return searchMockBooks(query, {
    page: params.page,
    limit: params.limit,
  });
}

/**
 * Daftar kategori (dari sumber lokal)
 */
export async function fetchCategories(): Promise<Category[]> {
  return mockCategories;
}
