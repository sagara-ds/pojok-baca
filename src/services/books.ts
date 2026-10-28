/**
 * Adapter data buku: memuat manifest hasil pipeline (`data/books.json`)
 * lalu memetakannya ke tipe `Book` yang dipakai komponen UI.
 *
 * Manifest dibuat oleh `npm run pipe:manifest`. File ini di-import di sisi
 * server saja (Astro SSR), jadi tidak pernah dikirim mentah ke browser —
 * `data/links.private.json` juga tidak ikut ter-bundle ke client.
 */

import manifest from '../../data/books.json';
import type { Book, BookListResponse, Category, SearchParams } from './types';

export type ManifestBook = (typeof manifest.books)[number];

const BOOKS = manifest.books as unknown as ManifestBook[];

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
    category: entry.categories[0] ?? (entry.type === 'epub' ? 'epub' : 'buku'),
    publishedYear: 0,
    pages: entry.pages,
    language: 'id',
    readingUrl: `/books/${entry.slug}/read/`,
  };
}

export function getAllBooks(): Book[] {
  return BOOKS.map(toBook);
}

export function getBook(slug: string): Book | null {
  const entry = BOOKS.find((b) => b.slug === slug);
  return entry ? toBook(entry) : null;
}

export function searchBooksLocal(query: string): Book[] {
  const q = query.trim().toLowerCase();
  if (!q) return getAllBooks();
  return BOOKS.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.slug.includes(q),
  ).map(toBook);
}

export function getCategories(): Category[] {
  const counts = new Map<string, number>();
  for (const book of BOOKS) {
    const key = book.categories[0] ?? (book.type === 'epub' ? 'epub' : 'buku');
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
}

export function getReaderConfig(slug: string): ReaderConfig | null {
  const entry = BOOKS.find((b) => b.slug === slug);
  if (!entry || !entry.pages) return null;
  return {
    slug: entry.slug,
    count: entry.pages,
    pageW: entry.pageW ?? 900,
    pageH: entry.pageH ?? 1316,
    mode: entry.assetMode ?? 'images',
    indexUrl: `/data/pages/${entry.slug}.json`,
  };
}

export type { Book, BookListResponse, Category, SearchParams };
