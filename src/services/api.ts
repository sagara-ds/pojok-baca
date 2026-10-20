/**
 * Welib.org API Client
 * Handles fetching, caching, sanitization, and error handling
 * Falls back to mock data when real API is unavailable (Cloudflare protection)
 */

import type { Book, BookListResponse, SearchParams, Category, ApiError } from './types';
import { getMockBooks, getMockBook, searchMockBooks, mockCategories } from './mock-data';

// Re-export mock functions for use by API proxy
export { getMockBooks, getMockBook, searchMockBooks, mockCategories };

const WELIB_API_BASE = 'https://id.welib.org/api';

// Check if we're in development mode (use mock data for easier dev)
const USE_MOCK_DATA = import.meta.env.DEV || import.meta.env.PUBLIC_USE_MOCK === 'true';
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
    category: sanitizeText(String(b.category ?? b.genre ?? b.kategori ?? '')),
    publishedYear: Number(b.publishedYear ?? b.year ?? b.tahun_terbit ?? 0) || new Date().getFullYear(),
    pages: Number(b.pages ?? b.page_count ?? b.jumlah_halaman ?? 0) || 0,
    language: sanitizeText(String(b.language ?? b.lang ?? b.bahasa ?? 'id')),
    isbn: b.isbn ? sanitizeText(String(b.isbn)) : undefined,
    readingUrl: b.readingUrl ? sanitizeText(String(b.readingUrl)) : undefined,
  };
}

/**
 * Generic fetch with timeout and retry
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
 * Fetch single book by slug
 */
export async function fetchBook(slug: string): Promise<Book | null> {
  // Use mock data in development or when explicitly enabled
  if (USE_MOCK_DATA) {
    console.log('[DEV] Using mock data for fetchBook:', slug);
    return getMockBook(slug);
  }

  try {
    const response = await fetchWithRetry(`${WELIB_API_BASE}/books/${slug}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await parseJsonResponse<unknown>(response);
    return sanitizeBook(data);
  } catch (error) {
    console.error(`Failed to fetch book ${slug}:`, error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for fetchBook:', slug);
    return getMockBook(slug);
  }
}

/**
 * Fetch paginated book list
 */
export async function fetchBooks(params: SearchParams = {}): Promise<BookListResponse> {
  // Use mock data in development or when explicitly enabled
  if (USE_MOCK_DATA) {
    console.log('[DEV] Using mock data for fetchBooks:', params);
    return getMockBooks(params);
  }

  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.category) searchParams.set('category', params.category);
  if (params.year) searchParams.set('year', String(params.year));
  if (params.language) searchParams.set('language', params.language);
  if (params.sort) searchParams.set('sort', params.sort);

  try {
    const response = await fetchWithRetry(`${WELIB_API_BASE}/books?${searchParams}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await parseJsonResponse<{ data: unknown[]; pagination: BookListResponse['pagination'] }>(response);

    const books = data.data
      .map(sanitizeBook)
      .filter((book): book is Book => book !== null);

    return {
      data: books,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error('Failed to fetch books:', error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for fetchBooks:', params);
    return getMockBooks(params);
  }
}

/**
 * Search books
 */
export async function searchBooks(query: string, params: Omit<SearchParams, 'q'> = {}): Promise<BookListResponse> {
  // Use mock data in development or when explicitly enabled
  if (USE_MOCK_DATA) {
    console.log('[DEV] Using mock data for searchBooks:', query, params);
    return searchMockBooks(query, params);
  }

  const searchParams = new URLSearchParams();
  searchParams.set('q', query);

  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.category) searchParams.set('category', params.category);
  if (params.sort) searchParams.set('sort', params.sort);

  try {
    const response = await fetchWithRetry(`${WELIB_API_BASE}/books/search?${searchParams}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await parseJsonResponse<{ data: unknown[]; pagination: BookListResponse['pagination'] }>(response);

    const books = data.data
      .map(sanitizeBook)
      .filter((book): book is Book => book !== null);

    return {
      data: books,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error('Failed to search books:', error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for searchBooks:', query, params);
    return searchMockBooks(query, params);
  }
}

/**
 * Fetch categories
 */
export async function fetchCategories(): Promise<Category[]> {
  // Use mock data in development or when explicitly enabled
  if (USE_MOCK_DATA) {
    console.log('[DEV] Using mock data for fetchCategories');
    return mockCategories;
  }

  try {
    const response = await fetchWithRetry(`${WELIB_API_BASE}/categories`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await parseJsonResponse<Category[]>(response);
    return data;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    // Fallback to mock data on error
    console.log('[FALLBACK] Using mock data for fetchCategories');
    return mockCategories;
  }
}

/**
 * Create API error response
 */
export function createApiError(message: string, status = 500, code?: string): ApiError {
  return { message, status, code };
}