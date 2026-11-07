import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';

import { config } from '../config.mjs';
import { decodeEntities, ensureDir, sleep, stripTags } from './util.mjs';

const FILE_ID_RE = /([A-Za-z0-9_-]{25,45})/;

/**
 * Enumerasi isi folder Drive publik lewat endpoint embeddedfolderview.
 * Endpoint ini mengembalikan HTML ringan (tanpa JS) berisi <a> per file.
 */
export async function listFolder(folderId = config.drive.folderId) {
  const url = `${config.drive.listUrl}?${new URLSearchParams({ id: folderId })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': config.drive.userAgent, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Gagal listing folder Drive (HTTP ${res.status}). Pastikan folder publik "siapa saja yang punya link".`);
  }
  const html = await res.text();

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : '';

  const files = [];
  const seen = new Set();
  const anchorRe = /<a[^>]+href="([^"]*\/file\/d\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(anchorRe)) {
    const href = decodeEntities(match[1]);
    const idMatch = href.match(FILE_ID_RE);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const name = decodeEntities(stripTags(match[2]))
      .replace(/\s+/g, ' ')
      .trim();
    files.push({ id, name });
  }

  if (files.length === 0) {
    throw new Error('Folder Drive tidak menghasilkan file. Cek link sharing & ID folder.');
  }

  return { title, files };
}

/**
 * Unduh satu file Drive ke disk. Retry dengan exponential backoff untuk
 *rate limit (HTTP 429/5xx) dan error jaringan.
 */
export async function downloadFile(id, destPath, { onRetry } = {}) {
  const url = `${config.drive.downloadUrl}?${new URLSearchParams({
    id,
    export: 'download',
    confirm: 't',
  })}`;

  let lastError;
  for (let attempt = 0; attempt <= config.drive.retries; attempt++) {
    if (attempt > 0) {
      const backoff = config.drive.retryBaseMs * 2 ** (attempt - 1) + Math.random() * 500;
      onRetry?.(attempt, backoff, lastError?.message);
      await sleep(backoff);
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': config.drive.userAgent },
        redirect: 'follow',
        signal: AbortSignal.timeout(config.drive.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.body || contentType.includes('text/html')) {
        // Drive Sometimes returns an HTML interstitial page when the "virus scan" quota is triggered.
        throw new Error('HTML interstitial (kuota scan Drive / link perlu konfirmasi)');
      }

      await ensureDir(path.dirname(destPath));
      const tmp = `${destPath}.part`;
      await streamPipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
      await fsp.rename(tmp, destPath);

      const stat = await fsp.stat(destPath);
      return { bytes: stat.size };
    } catch (err) {
      lastError = err;
      await fsp.rm(`${destPath}.part`, { force: true }).catch(() => {});
    }
  }
  throw new Error(`Gagal unduh setelah ${config.drive.retries + 1} percobaan: ${lastError?.message}`);
}

/**
 * Unduh banyak file dengan batas konkurensi. File yang sudah ada di disk dilewati
 * (resume-friendly).
 */
export async function downloadAll(files, { getDest, concurrency = config.drive.concurrency, onDone, onError } = {}) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      const dest = getDest(file);
      try {
        const existing = await fsp.stat(dest).catch(() => null);
        if (existing && existing.size > 0) {
          results.push({ ...file, dest, bytes: existing.size, cached: true });
          onDone?.({ ...file, bytes: existing.size, cached: true });
          continue;
        }
        const { bytes } = await downloadFile(file.id, dest, {
          onRetry: (attempt, backoff, reason) => onError?.({ file, attempt, backoff, reason }),
        });
        results.push({ ...file, dest, bytes, cached: false });
        onDone?.({ ...file, bytes, cached: false });
      } catch (err) {
        results.push({ ...file, dest, bytes: 0, error: err.message });
        onError?.({ file, error: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return results;
}
