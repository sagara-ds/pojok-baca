/**
 * API service layer — Open Library (sumber utama) + Google Books (opsional)
 * Handles fetching, caching, sanitization, and error handling
 * Falls back to mock data when the upstream API is unavailable
 *
 * Riwayat: sebelumnya memakai welib.org (Anna's Archive lineage).
 * Sumber itu dihapus karena Cloudflare memblokir akses server-side
 * (HTTP 403 terverifikasi) — lihat feat/openlibrary-integration.
 */

import type { Book, BookListResponse, SearchParams, Category, ApiError } from './types';
import { getOpenLibraryBook, searchOpenLibrary, isOpenLibrarySlug } from './openlibrary';
import { getMockBooks, getMockBook, searchMockBooks, mockCategories } from './mock-data';

// Re-export mock functions for use by API proxy
export { getMockBooks, getMockBook, searchMockBooks, mockCategories };

// Private mode: paksa mock data via env PUBLIC_USE_MOCK=true.
// Development tetap memakai API asli (Open Library publik & stabil),
// mock hanya dipakai sebagai fallback saat upstream gagal.
const USE_MOCK_DATA = import.meta.env.PUBLIC_USE_MOCK === 'true';
const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Sanitize HTML content to prevent XSS
 * Only allows safe tags and attributes
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
 * Validate and sanitize book data from API
 */
export function sanitizeBook(book: unknown): Book | null {
  if (!book || typeof book !== 'object') return null;

  const b = book as Record<string, unknown>;

  // Required fields
  const id = String(b.id ?? b.slug ?? '');
  const slug = String(b.slug ?? b.id ?? '');
  const title = sanitizeText(String(b.title ?? ''));
  const author = sanitizeText(String(b.author ?? ''));

  if (!id || !slug || !title || !author) {
    console.warn('Invalid book data, missing required fields:', b);
    return null;
  }

  return {
    id,
    slug,
    title,
    author,
    coverUrl: sanitizeText(String(b.coverUrl ?? b.cover_image ?? b.image ?? '')),
    description: sanitizeHtml(String(b.description ?? b.summary ?? b.sinopsis ?? '')),
    category: sanitizeText(String(b.category ?? b.genre ?? b.kategori ?? b.subject ?? '')),
    publishedYear: Number(b.publishedYear ?? b.year ?? b.tahun_terbit ?? 0) || new Date().getFullYear(),
    pages: Number(b.pages ?? b.page_count ?? b.jumlah_halaman ?? 0) || 0,
    language: sanitizeText(String(b.language ?? b.lang ?? b.bahasa ?? 'id')),
    isbn: b.isbn ? sanitizeText(String(b.isbn)) : undefined,
    readingUrl: b.readingUrl ? sanitizeText(String(b.readingUrl)) : undefined,
    isMock: Boolean(b.isMock) || undefined,
  };
}

/**
 * Generic fetch with timeout and retry.
 * (Dipakai sumber upstream non-library seperti Google Books;
 *  Open Library punya client sendiri di openlibrary.ts.)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PojokBacaBerdua/1.0',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok && retries > 0 && response.status >= 500) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (retries > 0 && error instanceof Error && error.name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }

    throw error;
  }
}

/**
 * Parse JSON response with error handling
 */
async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    throw new Error(`Empty response from ${response.url}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response from ${response.url}: ${text.slice(0, 200)}`);
  }
}

/**
 * Fetch single book by slug.
 * Slug Open Library (OL…W) dirutekan ke Open Library,
 * slug lama dari mock data tetap dilayani mock.
 */
export async function fetchBook(slug: string): Promise<Book | null> {
  if (USE_MOCK_DATA) {
    console.log('[MOCK] Using mock data for fetchBook:', slug);
    return withMockBook(getMockBook(slug));
  }

  // Slug mock lama (bukan work key) -> langsung mock
  if (!isOpenLibrarySlug(slug)) {
    return withMockBook(getMockBook(slug));
  }

  try {
    const book = await getOpenLibraryBook(slug);

    if (!book) {
      return null;
    }

    const sanitized = sanitizeBook(book);
    return sanitized ?? null;
  } catch (error) {
    console.error(`Failed to fetch book ${slug}:`, error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for fetchBook:', slug);
    return withMockBook(getMockBook(slug));
  }
}

/**
 * Fetch paginated book list
 */
export async function fetchBooks(params: SearchParams = {}): Promise<BookListResponse> {
  if (USE_MOCK_DATA) {
    console.log('[MOCK] Using mock data for fetchBooks:', params);
    return withMockList(getMockBooks(params));
  }

  try {
    const result = await searchOpenLibrary({ ...params, q: params.q ?? undefined });

    if (!result) {
      throw new Error('Open Library tidak dapat diakses');
    }

    const data = result.data
      .map(sanitizeBook)
      .filter((book): book is Book => book !== null);

    return {
      data,
      pagination: result.pagination,
      isMock: undefined,
    };
  } catch (error) {
    console.error('Failed to fetch books:', error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for fetchBooks:', params);
    return withMockList(getMockBooks(params));
  }
}

/**
 * Search books
 */
export async function searchBooks(query: string, params: Omit<SearchParams, 'q'> = {}): Promise<BookListResponse> {
  if (USE_MOCK_DATA) {
    console.log('[MOCK] Using mock data for searchBooks:', query, params);
    return withMockList(searchMockBooks(query, params));
  }

  try {
    const result = await searchOpenLibrary({ ...params, q: query });

    if (!result) {
      throw new Error('Open Library tidak dapat diakses');
    }

    const data = result.data
      .map(sanitizeBook)
      .filter((book): book is Book => book !== null);

    return {
      data,
      pagination: result.pagination,
      isMock: undefined,
    };
  } catch (error) {
    console.error('Failed to search books:', error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for searchBooks:', query, params);
    return withMockList(searchMockBooks(query, params));
  }
}

/**
 * Fetch categories.
 *
 * Open Library tidak punya katalog kategori yang cocok dengan UI
 * berbahasa Indonesia — categories tetap diambil dari mock, dipakai
 * client sebagai filter subject facet di openlibrary.ts.
 */
export async function fetchCategories(): Promise<Category[]> {
  if (USE_MOCK_DATA) {
    console.log('[MOCK] Using mock data for fetchCategories');
    return mockCategories;
  }

  // Categories bisa di-extend nanti (mis. Subjects API Open Library);
  // untuk sekarang seluruhnya dari mock.
  return mockCategories;
}

/**
 * Create API error response
 */
export function createApiError(message: string, status = 500, code?: string): ApiError {
  return { message, status, code };
}

/* ------------------------------- helpers --------------------------------- */

function withMockList(value: BookListResponse): BookListResponse {
  return { ...value, isMock: true };
}

function withMockBook(value: Book | null): Book | null {
  return value ? { ...value, isMock: true } : null;
}
