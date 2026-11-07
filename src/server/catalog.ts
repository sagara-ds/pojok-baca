/**
 * Penyimpanan katalog "pending" hasil unggahan admin.
 *
 * Alur yang direncanakan:
 *   1. Admin unggah PDF + metadata -> file disimpan di R2 (`PB_BOOKS`)
 *      dan metadata di KV (`PB_CATALOG`) dengan status `pending`.
 *   2. Pipeline lokal dijalankan (`npm run pipe:scan`, `pipe:render`,
 *      `pipe:manifest`) untuk menghasilkan aset.
 *   3. Setelah manifest berisi slug tersebut, entri pending bisa dihapus.
 *
 * Kalau binding belum tersedia (mis. `astro dev` atau Workers tanpa R2/KV),
 * metadata disimpan di memori proses dan file tidak bisa dipersist —
 * API akan memberi tahu admin untuk memakai alur manual.
 */

import type { StatsEnv, KVLike } from './stats';

export interface PendingBook {
  slug: string;
  title: string;
  author: string;
  synopsis: string;
  categories: string[];
  fileKey?: string;
  createdAt: string;
}

const memory = new Map<string, PendingBook>();
const PREFIX = 'pending:';

function kv(env: StatsEnv): KVLike | null {
  return env.PB_CATALOG ?? null;
}

export async function savePending(env: StatsEnv, entry: PendingBook): Promise<void> {
  const store = kv(env);
  if (store) {
    await store.put(`${PREFIX}${entry.slug}`, JSON.stringify(entry));
    return;
  }
  memory.set(entry.slug, entry);
}

export async function listPending(env: StatsEnv): Promise<PendingBook[]> {
  const store = kv(env);
  if (!store) return [...memory.values()];

  const out: PendingBook[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: PREFIX, limit: 200, cursor });
    for (const { name } of page.keys) {
      const raw = await store.get(name);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw) as PendingBook);
      } catch {
        /* entri rusak */
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removePending(env: StatsEnv, slug: string): Promise<void> {
  const store = kv(env);
  if (store?.delete) {
    await store.delete(`${PREFIX}${slug}`);
    return;
  }
  memory.delete(slug);
}
