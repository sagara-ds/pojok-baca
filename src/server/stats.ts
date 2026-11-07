/**
 * Penyimpanan statistik event.
 *
 * Di Cloudflare Workers, binding KV bernama `PB_STATS` dipakai kalau ada.
 * Kalau binding belum dikonfigurasi (mis. saat `astro dev` dengan adapter
 * node), data disimpan di memori proses — cukup untuk development, hilang
 * saat server restart.
 *
 * Key yang dipakai:
 *   pageview:total              -> jumlah kunjungan
 *   pageview:<YYYY-MM-DD>       -> kunjungan harian
 *   book:<slug>:read            -> jumlah mulai baca
 *   book:<slug>:bookmark        -> jumlah disimpan
 *   book:<slug>:like            -> jumlah disukai
 */

import { env as platformEnv } from 'cloudflare:workers';

export interface StatsEnv {
  PB_STATS?: KVLike | null;
  PB_CATALOG?: KVLike | null;
  PB_BOOKS?: R2Like | null;
  PB_ADMIN_TOKEN?: string;
  [key: string]: unknown;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete?: boolean;
    cursor?: string;
  }>;
  delete?(key: string): Promise<void>;
}

export interface R2Like {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<unknown>;
}

const memory = new Map<string, number>();

/** Binding Cloudflare modern; development Node memakai alias di konfigurasi Vite. */
export function getStatsEnv(_locals?: unknown): StatsEnv {
  return platformEnv as StatsEnv;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readNumber(env: StatsEnv, key: string): Promise<number> {
  const kv = env.PB_STATS;
  if (kv) {
    const raw = await kv.get(key);
    return raw ? Number(raw) || 0 : 0;
  }
  return memory.get(key) ?? 0;
}

async function writeNumber(env: StatsEnv, key: string, value: number): Promise<void> {
  const kv = env.PB_STATS;
  if (kv) {
    await kv.put(key, String(value));
    return;
  }
  memory.set(key, value);
}

export type EventType = 'pageview' | 'read' | 'complete' | 'bookmark' | 'like';

/** Catat satu event. `slug` wajib untuk read/bookmark/like. */
export async function recordEvent(env: StatsEnv, type: EventType, slug?: string): Promise<void> {
  if (type === 'pageview') {
    const total = await readNumber(env, 'pageview:total');
    await writeNumber(env, 'pageview:total', total + 1);
    const dailyKey = `pageview:${today()}`;
    const daily = await readNumber(env, dailyKey);
    await writeNumber(env, dailyKey, daily + 1);
    return;
  }

  if (!slug) return;

  // Bookmark bersifat toggle dari sisi klien: klien mengirim +1 atau -1.
  // Untuk kesederhanaan, API memakai `delta` (lihat route handler).
  const key = `book:${slug}:${type}`;
  const current = await readNumber(env, key);
  await writeNumber(env, key, current + 1);
}

/** Ubah hitungan bookmark dengan delta (bisa negatif, minimal 0). */
export async function adjustBookmark(env: StatsEnv, slug: string, delta: number): Promise<number> {
  const key = `book:${slug}:bookmark`;
  const current = await readNumber(env, key);
  const next = Math.max(0, current + delta);
  await writeNumber(env, key, next);
  return next;
}

export interface BookStats {
  read: number;
  bookmark: number;
  like: number;
}

export async function getBookStats(env: StatsEnv, slug: string): Promise<BookStats> {
  const [read, bookmark, like] = await Promise.all([
    readNumber(env, `book:${slug}:read`),
    readNumber(env, `book:${slug}:bookmark`),
    readNumber(env, `book:${slug}:like`),
  ]);
  return { read, bookmark, like };
}

export type StatEventType = 'read' | 'complete' | 'bookmark' | 'like';

/**
 * Peta slug -> jumlah event untuk satu tipe.
 * Dipakai untuk "Populer" (read) dan daftar admin (bookmark/complete).
 */
export async function getEventCounts(
  env: StatsEnv,
  type: StatEventType,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const pattern = new RegExp(`^book:(.+):${type}$`);

  const kv = env.PB_STATS;
  if (!kv) {
    for (const [key, value] of memory.entries()) {
      const match = pattern.exec(key);
      if (match) result[match[1]] = value;
    }
    return result;
  }

  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'book:', limit: 1000, cursor });
    for (const { name } of page.keys) {
      const match = pattern.exec(name);
      if (!match) continue;
      const raw = await kv.get(name);
      result[match[1]] = raw ? Number(raw) || 0 : 0;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return result;
}

/** Peta slug -> jumlah dibaca, untuk sort "Populer" & badge di kartu. */
export async function getReadCounts(env: StatsEnv): Promise<Record<string, number>> {
  return getEventCounts(env, 'read');
}

export async function getTotalPageviews(env: StatsEnv): Promise<number> {
  return readNumber(env, 'pageview:total');
}

export async function getDailyPageviews(env: StatsEnv, days = 14): Promise<{ date: string; count: number }[]> {
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: await readNumber(env, `pageview:${key}`) });
  }
  return out;
}
