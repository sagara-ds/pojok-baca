/**
 * Open Library API Client (unofficial client, ditulis sendiri)
 * Docs: https://openlibrary.org/dev/docs/api/search
 *
 * Strategi (semua endpoint sudah diverifikasi live 21 Okt 2026):
 * - List/search  : GET /search.json?q=...&language=...&limit&offset&fields=...
 * - Detail buku  : GET /search.json?q=key:/works/{id} (metadata + cover)
 *                  + GET /works/{id}.json (description)
 * - Cover        : https://covers.openlibrary.org/b/id/{cover_i}-L.jpg
 *
 * Catatan solr yang wajib dipatuhi:
 * - q kosong / q="*" -> 0 hasil atau error; browse tanpa kata kunci
 *   wajib pakai query field: language:ind, language:(ind eng)
 * - Kombinasi pakai AND (bukan OR longgar): q=<teks> AND subject:fiction
 * - Parameter language boleh diulang: language=ind&language=eng
 */

import type { Book, BookListResponse, SearchParams } from './types';

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';
const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_LIMIT = 100;

// Kode bahasa app -> kode MARC Open Library
const appLangToOpenLibrary: Record<string, string> = {
  id: 'ind',
  ind: 'ind',
  en: 'eng',
  eng: 'eng',
};

// Kode MARC Open Library -> kode bahasa app
const openLibraryLangToApp: Record<string, string> = {
  ind: 'id',
  eng: 'en',
};

/**
 * Kategori app (slug dari mockCategories) -> subject facet Open Library.
 * Kategori yang tidak ada di tabel tetap dipakai apa adanya
 * (slug dipisah jadi spasi). 'umum' tidak punya padanan subject.
 */
const categoryToSubject: Record<string, string | null> = {
  pemrograman: 'computer programming',
  'ilmu-komputer': 'computer science',
  'web-development': 'web development',
  'data-science': 'data science',
  'software-engineering': 'software engineering',
  'software-architecture': 'software architecture',
  'keamanan-siber': 'computer security',
  'mobile-development': 'mobile apps',
  devops: 'devops',
  'cloud-computing': 'cloud computing',
  umum: null,
  pendidikan: 'education',
  produktivitas: 'time management',
  bahasa: 'language and languages',
  desain: 'design',
  filsafat: 'philosophy',
  fiksi: 'fiction',
  biografi: 'biography',
  sejarah: 'history',
};

// Opsi sort app -> nilai sort Open Library
const appSortToOpenLibrary: Record<NonNullable<SearchParams['sort']>, string> = {
  newest: 'new',
  oldest: 'old',
  popular: 'rating',
  'title-asc': 'title asc',
  'title-desc': 'title desc',
};

interface OpenLibrarySearchDoc {
  key: string; // "/works/OL15302003W"
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  number_of_pages_median?: number;
  ebook_access?: 'public' | 'borrowable' | 'printdisabled' | 'no_ebook';
  language?: string[];
  subject?: string[];
}

interface OpenLibrarySearchResponse {
  numFound: number;
  start?: number;
  docs: OpenLibrarySearchDoc[];
}

interface OpenLibraryWork {
  title?: string;
  description?: string | { type?: string; value?: string };
  subjects?: string[];
}

/**
 * Fetch dengan timeout + retry (konsisten dengan perilaku api.ts).
 */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PojokBacaRPL/1.0 (Astro SSR; github.com/pojok-baca)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok && retries > 0 && response.status >= 500) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, retries - 1);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (retries > 0 && error instanceof Error && error.name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, retries - 1);
    }

    throw error;
  }
}

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
 * Membangun query solr + parameter language.
 *
 * - Ada q : kirim lewat parameter language (terverifikasi bekerja dengan
 *           free-text query: language=ind&language=eng).
 * - Tanpa q: language ditanam ke dalam q karena parameter language saja tidak
 *           cukup untuk browse semua buku (q kosong -> 0 hasil).
 */
function buildQueryParts(params: {
  q?: string;
  language?: string;
  category?: string;
}): { q: string; languageParams: string[] } {
  const langMarc = params.language ? appLangToOpenLibrary[params.language.toLowerCase()] : undefined;
  const subject = params.category ? categoryToSubject[params.category] ?? params.category.replace(/-/g, ' ') : undefined;

  if (params.q) {
    let q = params.q;
    if (subject) {
      q = `${q} AND subject:${subject}`;
    }
    return { q, languageParams: langMarc ? [langMarc] : [] };
  }

  let q: string;
  if (langMarc) {
    q = `language:${langMarc}`;
  } else {
    q = 'language:(ind eng)';
  }
  if (subject) {
    q = `${q} AND subject:${subject}`;
  }
  return { q, languageParams: [] };
}

/**
 * "/works/OL15302003W" -> "OL15302003W"
 */
function extractWorkId(key: string): string {
  return key.replace(/^\/works\//, '');
}

/**
 * Cek apakah slug cocok dengan pola work key Open Library (OLxxxxxxxW).
 * Slug lama dari mock data tetap diterima oleh api.ts lewat fallback.
 */
export function isOpenLibrarySlug(slug: string): boolean {
  return /^OL\d+W$/i.test(slug);
}

function extractDescription(work: OpenLibraryWork): string {
  const raw = work.description;

  if (!raw) return '';

  // Description bisa string atau object { value: "..." } tergantung data
  if (typeof raw === 'string') return raw;

  if (typeof raw.value === 'string') return raw.value;

  return '';
}

function mapDocToBook(doc: OpenLibrarySearchDoc): Book {
  const id = extractWorkId(doc.key);

  const author =
    doc.author_name && doc.author_name.length > 0
      ? doc.author_name.slice(0, 3).join(', ')
      : 'Tidak diketahui';

  const languageCodes = (doc.language ?? [])
    .map(code => openLibraryLangToApp[code] ?? code.toLowerCase());
  const language = languageCodes[0] ?? '';

  // Utamakan ISBN-13 agar konsisten
  const isbn =
    doc.isbn?.find(code => code.length === 13) ??
    doc.isbn?.find(code => code.length === 10) ??
    undefined;

  return {
    id,
    slug: id,
    title: doc.title ?? '',
    author,
    coverUrl: '', // diisi mapDocToBookWithCover via cover_i
    description: '',
    category: doc.subject?.[0] ?? '',
    publishedYear: doc.first_publish_year ?? new Date().getFullYear(),
    pages: doc.number_of_pages_median ?? 0,
    language,
    isbn,
    readingUrl: `${OPEN_LIBRARY_BASE}/works/${id}`,
  };
}

/**
 * URL cover Open Library. Mengembalikan string kosong bila tidak ada cover,
 * sehingga UI menampilkan placeholder SVG (bukan gambar transparan 1px).
 */
export function buildCoverUrl(coverId: number | undefined): string {
  if (!coverId) return '';
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

export function mapDocToBookWithCover(doc: OpenLibrarySearchDoc): Book {
  const book = mapDocToBook(doc);
  book.coverUrl = buildCoverUrl(doc.cover_i);
  return book;
}

/**
 * Pencarian / daftar buku Open Library.
 * Mengembalikan null bila gagal (pemanggil memutuskan fallback).
 */
export async function searchOpenLibrary(params: SearchParams = {}): Promise<BookListResponse | null> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 20), MAX_LIMIT);
  const offset = (page - 1) * limit;

  const queryParts = buildQueryParts(params);
  const url = new URL('/search.json', OPEN_LIBRARY_BASE);
  url.searchParams.set('q', queryParts.q);
  for (const lang of queryParts.languageParams) {
    url.searchParams.append('language', lang);
  }
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('fields', [
    'key',
    'title',
    'subtitle',
    'author_name',
    'first_publish_year',
    'cover_i',
    'isbn',
    'number_of_pages_median',
    'ebook_access',
    'language',
    'subject',
  ].join(','));

  if (params.sort) {
    url.searchParams.set('sort', appSortToOpenLibrary[params.sort]);
  }

  try {
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) {
      console.error(`Open Library search error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await parseJsonResponse<OpenLibrarySearchResponse>(response);
    const total = data.numFound ?? 0;

    return {
      data: (data.docs ?? [])
        .filter(doc => doc.key && doc.title)
        .map(mapDocToBookWithCover),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('Failed to search Open Library:', error);
    return null;
  }
}

/**
 * Buku single berdasarkan work id Open Library (contoh: OL15302003W).
 * Metadata utama dari /search.json (cover, isbn, pages), description
 * dari /works/{id}.json. Mengembalikan null bila tidak ditemukan / gagal.
 */
export async function getOpenLibraryBook(slug: string): Promise<Book | null> {
  if (!isOpenLibrarySlug(slug)) {
    return null;
  }

  const searchUrl = new URL('/search.json', OPEN_LIBRARY_BASE);
  searchUrl.searchParams.set('q', `key:/works/${slug}`);
  searchUrl.searchParams.set('fields', [
    'key',
    'title',
    'subtitle',
    'author_name',
    'first_publish_year',
    'cover_i',
    'isbn',
    'number_of_pages_median',
    'ebook_access',
    'language',
    'subject',
  ].join(','));

  try {
    const searchResponse = await fetchWithRetry(searchUrl.toString());
    if (!searchResponse.ok) {
      console.error(`Open Library book search error: ${searchResponse.status} ${searchResponse.statusText}`);
      return null;
    }

    const searchData = await parseJsonResponse<OpenLibrarySearchResponse>(searchResponse);
    const doc = searchData.docs?.[0];

    if (!doc) {
      return null;
    }

    const book = mapDocToBookWithCover(doc);

    // Description (boleh gagal, description opsional)
    try {
      const workResponse = await fetchWithRetry(`${OPEN_LIBRARY_BASE}/works/${slug}.json`);
      if (workResponse.ok) {
        const work = await parseJsonResponse<OpenLibraryWork>(workResponse);
        book.description = extractDescription(work);
        if (!book.category && work.subjects?.length) {
          book.category = work.subjects[0];
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch description for ${slug}:`, error);
    }

    return book;
  } catch (error) {
    console.error(`Failed to fetch Open Library book ${slug}:`, error);
    return null;
  }
}
