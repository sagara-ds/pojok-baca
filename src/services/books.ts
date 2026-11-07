/**
 * Adapter data buku: memuat manifest hasil pipeline (`data/books.json`)
 * lalu memetakannya ke tipe `Book` yang dipakai komponen UI.
 *
 * Manifest dibuat oleh `npm run pipe:manifest`. File ini di-import di sisi
 * server saja (Astro SSR), jadi tidak pernah dikirim mentah ke browser —
 * `data/links.private.json` juga tidak ikut ter-bundle ke client.
 *
 * Kurationi (buku 18+ & varian duplikat) ada di `curation.ts`.
 */

import manifest from '../../data/books.json';
import type { Book, BookListResponse, Category, SearchParams } from './types';
import { isPublicSlug } from './curation';

export type ManifestBook = (typeof manifest.books)[number];

const BOOKS = manifest.books as unknown as ManifestBook[];

/** Normalisasi teks untuk pencarian: buang diakritik & tanda baca. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((t) => t.length >= 2);
}

/** Petakan satu entri manifest ke bentuk `Book` milik UI. */
function toBook(entry: ManifestBook): Book {
  return {
    id: entry.slug,
    slug: entry.slug,
    title: entry.title,
    author: entry.author || 'Tidak diketahui',
    // Tanpa cover → string kosong: seluruh UI (kartu, detail, typeahead)
    // memakai placeholder desain, tidak ada <img>/404 sama sekali.
    coverUrl: entry.hasCover ? entry.cover : '',
    description: entry.synopsis,
    // Kategori generik ('buku'/'epub') tidak informatif -> kosongkan agar
    // UI tidak menampilkan chip meaningless seperti "buku".
    category: entry.categories[0] ?? '',
    // Manifest tidak menyimpan tahun terbit. undefined (bukan 0) supaya
    // chip tahun tidak dirender sebagai angka "0".
    publishedYear: undefined,
    pages: entry.pages,
    language: 'id',
    readingUrl: `/books/${entry.slug}/read/`,
    hasTextLayer: Boolean(entry.hasTextLayer),
    prolog: (entry as { prolog?: string }).prolog,
  };
}

/** Semua buku publik (tanpa buku dewasa & tanpa varian duplikat). */
export function getAllBooks(): Book[] {
  return BOOKS.filter((b) => isPublicSlug(b.slug)).map(toBook);
}

/**
 * Detail satu buku. Buku dewasa/varian tetap bisa diambil lewat
 * `includeHidden` (dipakai halaman arsip & admin), tapi default publik
 * mengembalikan null supaya tidak bisa diakses langsung.
 */
export function getBook(slug: string, options: { includeHidden?: boolean } = {}): Book | null {
  const entry = BOOKS.find((b) => b.slug === slug);
  if (!entry) return null;
  if (!options.includeHidden && !isPublicSlug(slug)) return null;
  return toBook(entry);
}

/** Apakah slug ada di manifest (termasuk yang disembunyikan). */
export function bookExists(slug: string): boolean {
  return BOOKS.some((b) => b.slug === slug);
}

/**
 * Pencarian lokal (Opsi A): judul + penulis + sinopsis + kategori.
 *
 * Skor memberi bobot lebih besar ke judul, lalu penulis, lalu sinopsis.
 * Query dipecah jadi token supaya "kakek pemarah" tetap cocok dengan
 * sinopsis yang memuat kedua kata itu walau tidak berurutan.
 */
export function searchBooksLocal(query: string): Book[] {
  const q = query.trim();
  if (!q) return getAllBooks();

  const tokens = tokenize(q);
  if (tokens.length === 0) return [];

  const scored = BOOKS.filter((b) => isPublicSlug(b.slug))
    .map((entry) => {
      const title = normalize(entry.title);
      const author = normalize(entry.author || '');
      const synopsis = normalize(entry.synopsis || '');
      const categories = normalize(entry.categories.join(' '));

      let score = 0;
      for (const token of tokens) {
        if (title.includes(token)) score += 8;
        if (author.includes(token)) score += 4;
        if (synopsis.includes(token)) score += 2;
        if (categories.includes(token)) score += 2;
      }

      // Bonus kalau seluruh frasa muncul utuh di salah satu field.
      const phrase = normalize(q);
      if (title.includes(phrase)) score += 12;
      if (synopsis.includes(phrase)) score += 6;

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'id'));

  return scored.map((item) => toBook(item.entry));
}

export function getCategories(): Category[] {
  const counts = new Map<string, number>();
  for (const book of BOOKS) {
    if (!isPublicSlug(book.slug)) continue;
    // Hanya kategori nyata (tanpa fallback generik 'buku'/'epub')
    const key = book.categories[0];
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, bookCount]) => ({
      id: name,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      bookCount,
    }))
    .sort((a, b) => b.bookCount - a.bookCount);
}

export function getManifest(): typeof manifest {
  return manifest;
}

/** Konfigurasi reader untuk satu buku (diolah di src/scripts/reader.ts). */
export interface ReaderConfig {
  slug: string;
  count: number;
  pageW: number;
  pageH: number;
  mode: 'sheets' | 'images';
  indexUrl: string;
  title: string;
  author: string;
  coverUrl: string;
  hasTextLayer: boolean;
  textUrl: string;
}

export function getReaderConfig(slug: string): ReaderConfig | null {
  if (!isPublicSlug(slug)) return null;
  const entry = BOOKS.find((b) => b.slug === slug);
  if (!entry || (!entry.pages && !entry.hasTextLayer)) return null;
  return {
    slug: entry.slug,
    count: entry.pages,
    pageW: entry.pageW ?? 900,
    pageH: entry.pageH ?? 1316,
    mode: entry.assetMode === 'sheets' ? 'sheets' : 'images',
    indexUrl: `/data/pages/${entry.slug}.json`,
    title: entry.title,
    author: entry.author || 'Tidak diketahui',
    coverUrl: entry.hasCover ? entry.cover : '',
    hasTextLayer: Boolean(entry.hasTextLayer),
    textUrl: `/data/text/${entry.slug}.json`,
  };
}

/**
 * Buku untuk "Lanjutkan Baca" di beranda: daftar slug diambil dari
 * localStorage di browser, lalu dicocokkan ke manifest di server.
 */
export function getBooksBySlugs(slugs: string[]): Book[] {
  const wanted = new Set(slugs);
  return BOOKS.filter((b) => wanted.has(b.slug) && isPublicSlug(b.slug)).map(toBook);
}

export type { Book, BookListResponse, Category, SearchParams };
