/**
 * Google Books API Client — kondisi DORMANT (siap pakai, belum aktif)
 * Docs: https://developers.google.com/books/docs/v1/using
 *
 * Kenapa dormant: kuota anonymous (tanpa key) saat ini 0/hari —
 * tanpa key, semua request selalu 429 RESOURCE_EXHAUSTED.
 * Aktivasinya: set env GOOGLE_BOOKS_API_KEY lalu pasangkan
 * di services/api.ts sebagai sumber kedua / enrichment.
 *
 * Rekomendasi pemakaian nanti:
 * 1. Katalog Indonesia lebih luas: volumes?q=<query>&langRestrict=id
 * 2. Enrichment di halaman detail: match via ISBN -> kitek description
 *    dari Google (lebih sering terisi daripada Open Library).
 */

import type { Book, BookListResponse } from './types';

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
const DEFAULT_TIMEOUT = 10000;

interface GoogleVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  pageCount?: number;
  categories?: string[];
  language?: string; // BCP-47: "id", "en"
  industryIdentifiers?: Array<{ type: string; identifier: string }>;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string; small?: string; medium?: string; large?: string };
  previewLink?: string;
  infoLink?: string;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: GoogleVolumeInfo;
}

interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleVolume[];
}

export function isGoogleBooksEnabled(): boolean {
  return Boolean(import.meta.env.GOOGLE_BOOKS_API_KEY);
}

function buildCoverUrl(volumeInfo: GoogleVolumeInfo): string {
  const raw =
    volumeInfo.imageLinks?.large ??
    volumeInfo.imageLinks?.medium ??
    volumeInfo.imageLinks?.small ??
    volumeInfo.imageLinks?.thumbnail;

  // Google menyajikan thumbnail via http; paksa https
  if (!raw) return '';
  return raw.startsWith('//') ? `https:${raw}` : raw.replace(/^http:/, 'https:');
}

function pickIsbn(volumeInfo: GoogleVolumeInfo): string | undefined {
  const identifiers = volumeInfo.industryIdentifiers ?? [];
  return (
    identifiers.find(x => x.type === 'ISBN_13')?.identifier ??
    identifiers.find(x => x.type === 'ISBN_10')?.identifier ??
    undefined
  );
}

function mapVolumeToBook(volume: GoogleVolume): Book | null {
  const info = volume.volumeInfo;
  if (!info?.title) return null;

  const year = info.publishedDate ? Number(info.publishedDate.slice(0, 4)) || new Date().getFullYear() : new Date().getFullYear();

  return {
    id: volume.id,
    slug: volume.id,
    title: info.title,
    author: info.authors?.slice(0, 3).join(', ') ?? 'Tidak diketahui',
    coverUrl: buildCoverUrl(info),
    description: info.description ?? '',
    category: info.categories?.[0] ?? '',
    publishedYear: year,
    pages: info.pageCount ?? 0,
    language: info.language ?? '',
    isbn: pickIsbn(info),
    readingUrl: info.previewLink ?? info.infoLink,
  };
}

/**
 * Search Google Books. Selalu null bila API key belum diset,
 * sehingga pemanggil bisa jatuh ke Open Library tanpa cabang khusus.
 */
export async function searchGoogleBooks(params: {
  q: string;
  langRestrict?: 'id' | 'en';
  page?: number;
  limit?: number;
}): Promise<BookListResponse | null> {
  const apiKey = import.meta.env.GOOGLE_BOOKS_API_KEY as string | undefined;

  if (!apiKey) {
    return null;
  }

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 20), 40); // maxResults max 40
  const startIndex = (page - 1) * limit;

  const url = new URL('/volumes', GOOGLE_BOOKS_BASE);
  url.searchParams.set('q', params.q);
  if (params.langRestrict) url.searchParams.set('langRestrict', params.langRestrict);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('startIndex', String(startIndex));
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      console.error(`Google Books search error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as GoogleBooksResponse;
    const total = data.totalItems ?? 0;

    return {
      data: (data.items ?? []).map(mapVolumeToBook).filter((book): book is Book => book !== null),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('Failed to search Google Books:', error);
    return null;
  }
}

/**
 * Detail volume Google Books by id. Null bila key belum diset / gagal.
 */
export async function getGoogleBook(volumeId: string): Promise<Book | null> {
  const apiKey = import.meta.env.GOOGLE_BOOKS_API_KEY as string | undefined;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `${GOOGLE_BOOKS_BASE}/volumes/${encodeURIComponent(volumeId)}?key=${encodeURIComponent(apiKey)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      }
    );

    if (!response.ok) {
      console.error(`Google Books detail error: ${response.status} ${response.statusText}`);
      return null;
    }

    const volume = (await response.json()) as GoogleVolume;
    return mapVolumeToBook(volume);
  } catch (error) {
    console.error(`Failed to fetch Google Book ${volumeId}:`, error);
    return null;
  }
}
