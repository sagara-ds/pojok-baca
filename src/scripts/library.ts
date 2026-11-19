/**
 * Riwayat baca & bookmark — disimpan di localStorage, tanpa login.
 *
 * Bentuk entri sengaja memuat metadata tampilan (judul, penulis, cover)
 * supaya halaman /riwayat/ dan /bookmark/ bisa merender tanpa memanggil
 * server dan tanpa menyimpan data katalog lengkap.
 */

import { isAdult } from '../services/curation';

export interface SavedBook {
  slug: string;
  title: string;
  author: string;
  cover: string;
  page?: number;
  at: number;
}

const HISTORY_KEY = 'pb:history';
const BOOKMARK_KEY = 'pb:bookmarks';
const MAX_HISTORY = 40;

function read(key: string): SavedBook[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const visible = (parsed as SavedBook[]).filter((entry) => !isAdult(entry.slug));
    if (visible.length !== parsed.length) localStorage.setItem(key, JSON.stringify(visible));
    return visible;
  } catch {
    return [];
  }
}

function write(key: string, list: SavedBook[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('pb:library-change', { detail: { key } }));
  } catch {
    /* quota penuh / mode privat */
  }
}

export function getHistory(): SavedBook[] {
  return read(HISTORY_KEY).sort((a, b) => b.at - a.at);
}

export function recordHistory(entry: Omit<SavedBook, 'at'>): void {
  if (isAdult(entry.slug)) return;
  const list = read(HISTORY_KEY).filter((item) => item.slug !== entry.slug);
  list.unshift({ ...entry, at: Date.now() });
  write(HISTORY_KEY, list.slice(0, MAX_HISTORY));
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}

export function getBookmarks(): SavedBook[] {
  return read(BOOKMARK_KEY).sort((a, b) => b.at - a.at);
}

export function isBookmarked(slug: string): boolean {
  return read(BOOKMARK_KEY).some((item) => item.slug === slug);
}

/** Toggle bookmark; mengembalikan status baru (true = tersimpan). */
export function toggleBookmark(entry: Omit<SavedBook, 'at'>): boolean {
  if (isAdult(entry.slug)) return false;
  const list = read(BOOKMARK_KEY);
  const exists = list.some((item) => item.slug === entry.slug);
  const next = exists
    ? list.filter((item) => item.slug !== entry.slug)
    : [{ ...entry, at: Date.now() }, ...list];
  write(BOOKMARK_KEY, next);
  return !exists;
}

export function removeBookmark(slug: string): void {
  write(
    BOOKMARK_KEY,
    read(BOOKMARK_KEY).filter((item) => item.slug !== slug),
  );
}

/** Kirim event statistik tanpa memblokir UI. */
export function trackEvent(type: 'pageview' | 'read' | 'complete' | 'bookmark' | 'like', slug?: string, delta?: number): void {
  if (typeof fetch === 'undefined') return;
  try {
    void fetch('/api/stats/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, slug, delta }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* offline */
  }
}
