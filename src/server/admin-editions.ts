import { getDatabase } from './database';
import { getStorage } from '../lib/storage';

export const maxPageBytes = 4 * 1024 * 1024;

export function isWebp(bytes: Uint8Array, fileSize = bytes.length) {
  if (bytes.length < 16 || fileSize > maxPageBytes) return false;
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset,offset+4));
  return tag(0) === 'RIFF' && tag(8) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(tag(12))
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 === fileSize;
}

interface DraftInput {
  existing: string | null;
  slug: string;
  title: string;
  author: string;
  synopsis: string;
  categories: string[];
  pages: number;
  hash: string;
}

export async function startEdition(userId: string, input: DraftInput) {
  const sql = getDatabase();
  const [{ data }] = await sql`
    SELECT pojok_baca.admin_start_edition(
      ${userId}::uuid,${input.existing},${input.slug},${input.title},${input.author},
      ${input.synopsis},${input.categories}::text[],${input.pages}::integer,${input.hash}
    ) AS data`;
  return data as { error?: string; edition?: string; confirmed?: number[] };
}

export async function uploadKey(userId: string, edition: string, page: number, lease = 0): Promise<string | null> {
  const sql = getDatabase();
  const [{ key }] = await sql`
    SELECT pojok_baca.admin_upload_key(${userId}::uuid,${edition}::uuid,${page}::integer,${lease}::integer) AS key`;
  return key;
}

export async function confirmStoredPage(userId: string, edition: string, page: number, text: string) {
  const key = await uploadKey(userId, edition, page);
  if (!key) return { error: 'edition_not_staging' };
  const storage = await getStorage();
  const head = await storage.headObject(key);
  if (!head || head.size < 16 || head.size > maxPageBytes || head.contentType !== 'image/webp') {
    return { error: 'missing_webp' };
  }
  const object = await storage.getObjectStream(key);
  if (!object || object.size !== head.size) return { error: 'missing_webp' };
  const reader = object.body.getReader();
  const header = new Uint8Array(16);
  let offset = 0;
  try {
    while (offset < header.length) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, header.length - offset);
      header.set(chunk, offset);
      offset += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (offset !== header.length || !isWebp(header, object.size)) return { error: 'invalid_webp' };
  const sql = getDatabase();
  const [{ ok }] = await sql`
    SELECT pojok_baca.admin_confirm_page(${userId}::uuid,${edition}::uuid,${page}::integer,${text}) AS ok`;
  return ok ? { ok: true } : { error: 'edition_not_staging' };
}

export async function cleanupEdition(userId: string, edition: string): Promise<{
  error?: string;
  done?: boolean;
  retryAt?: string;
  remaining?: number;
}> {
  const sql = getDatabase();
  const [{ data }] = await sql`
    SELECT pojok_baca.admin_cleanup_keys(${userId}::uuid,${edition}::uuid) AS data`;
  if (data.error || data.done || data.retryAt) return data as { error?: string; done?: boolean; retryAt?: string };
  try {
    const progress = await (await getStorage()).deleteObjects(data.keys);
    if (progress) return { done: false, remaining: progress.remaining };
  } catch {
    return { error: 'cleanup_failed' };
  }
  const [{ done }] = await sql`
    SELECT pojok_baca.admin_finish_cleanup(${userId}::uuid,${edition}::uuid) AS done`;
  return { done: Boolean(done) };
}

export async function finalizeEdition(userId: string, edition: string) {
  const sql = getDatabase();
  const [{ data }] = await sql`
    SELECT pojok_baca.admin_finalize_edition(${userId}::uuid,${edition}::uuid) AS data`;
  return data as { error?: string; slug?: string; cleanup?: string[] };
}

export async function cancelEdition(userId: string, edition: string) {
  const sql = getDatabase();
  const [{ ok }] = await sql`
    SELECT pojok_baca.admin_cancel_edition(${userId}::uuid,${edition}::uuid) AS ok`;
  return Boolean(ok);
}

export async function listAdminUploads(userId: string) {
  const sql = getDatabase();
  const rows = await sql`SELECT * FROM pojok_baca.admin_uploads(${userId}::uuid)`;
  return rows as {
    edition: string; slug: string; title: string; state: 'staging' | 'cleanup_pending';
    ready_pages: string; total_pages: number; retry_at: string | null;
  }[];
}
