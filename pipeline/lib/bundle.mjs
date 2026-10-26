import { closeSync, openSync, readSync } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

// libvips memakai banyak thread per operasi. Kalau 6 operasi jalan bareng
// dengan 12 thread masing-masing, CPU jadi thrashing. Batasi 2 thread per
// operasi lalu jalankan 6 operasi paralel -> 12 thread = jumlah core.
sharp.concurrency(2);

/**
 * Bundling halaman jadi strip gambar vertikal.
 *
 * Dipakai untuk host dengan batas jumlah file (Cloudflare Workers/Pages:
 * 20.000 file per deploy). Koleksi ini punya ~41.700 halaman, jadi perlu
 * digabung. Strip 3 halaman -> ~14.000 file, aman di bawah batas.
 *
 * Dua mode, keduanya menghasilkan struktur indeks yang sama supaya reader
 * tidak perlu tahu bedanya:
 *
 *  - "sheets": N halaman digabung jadi 1 strip vertikal.
 *    Reader memotong strip dengan container overflow:hidden.
 *  - "images": 1 halaman = 1 file (tanpa bundling).
 *
 * Batas tinggi strip: 4096 px. Di atas itu sebagian browser mobile
 * (iOS Safari) gagal mendekode gambar.
 *
 * Index reader (data/pages/<slug>.json):
 *   { slug, mode, count, pageW, pageH,
 *     strips: [ { file, pages: [[y, h], ...] } ] }
 * pages[i] = posisi y halaman ke-i di dalam strip + tingginya.
 */

const GAP = 8;
const DEFAULT_MAX_HEIGHT = 4096;

/**
 * Baca dimensi WebP langsung dari header file.
 *
 * sharp.metadata() butuh ~28 ms per file; parser header cuma ~3 ms.
 * Untuk 41.000 halaman itu selisihnya 19 menit vs 2 menit.
 *
 * Format: RIFF....WEBP <fourcc> <size> <payload>
 *  - "VP8 " (lossy)  : lebar/tinggi 14-bit di offset 26/28
 *  - "VP8L" (lossless): 14-bit + 14-bit di offset 21
 *  - "VP8X" (extended): 24-bit + 24-bit di offset 24/27
 */
export function readWebpSize(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(32);
    readSync(fd, buf, 0, 32, 0);
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width, height };
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

export async function readPageSizes(pagesDir) {
  const entries = (await fsp.readdir(pagesDir))
    .filter((name) => name.endsWith('.webp'))
    .sort();

  const sizes = [];
  for (const name of entries) {
    const size = readWebpSize(path.join(pagesDir, name)) ?? { width: 0, height: 0 };
    sizes.push({ name, width: size.width, height: size.height });
  }
  return sizes;
}

/**
 * Susun kelompok halaman -> strip.
 * @returns {Array<Array<{name,width,height}>>}
 */
export function packStrips(sizes, { maxPages = 3, maxHeight = DEFAULT_MAX_HEIGHT } = {}) {
  const strips = [];
  let current = [];
  let currentHeight = 0;

  for (const size of sizes) {
    const addition = size.height + (current.length ? GAP : 0);
    const tooTall = currentHeight + addition > maxHeight;
    const tooMany = current.length >= maxPages;
    if (current.length && (tooTall || tooMany)) {
      strips.push(current);
      current = [];
      currentHeight = 0;
    }
    currentHeight += current.length ? size.height + GAP : size.height;
    current.push(size);
  }
  if (current.length) strips.push(current);
  return strips;
}

/**
 * Bundling satu buku: tulis strip + indeks reader.
 * @returns {Promise<{slug:string, mode:string, count:number, strips:number, bytes:number, pageW:number, pageH:number} | null>}
 */
export async function bundleBook(
  pagesDir,
  outDir,
  indexPath,
  {
    slug,
    mode = 'sheets',
    maxPages = 3,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = 78,
    concurrency = 6,
  } = {},
) {
  const sizes = await readPageSizes(pagesDir);
  if (!sizes.length) return null;

  await fsp.mkdir(outDir, { recursive: true });

  const pageW = sizes[0].width;
  const pageH = sizes[0].height;

  // Mode "images": tidak ada bundling, satu file per halaman.
  if (mode === 'images') {
    const index = {
      slug,
      mode,
      count: sizes.length,
      pageW,
      pageH,
      strips: sizes.map((size) => ({ file: size.name, pages: [[0, size.height]] })),
    };
    await fsp.mkdir(path.dirname(indexPath), { recursive: true });
    await fsp.writeFile(indexPath, JSON.stringify(index), 'utf8');
    return { slug, mode, count: sizes.length, strips: sizes.length, bytes: 0, pageW, pageH };
  }

  const groups = packStrips(sizes, { maxPages, maxHeight });
  const stripWidth = Math.max(...sizes.map((s) => s.width));

  const indexStrips = [];
  let totalBytes = 0;

  // Komposisi paralel: 6 strip sekaligus.
  const jobs = groups.map((group, i) => ({ group, i }));
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const { group, i } = jobs[cursor++];
      const height = group.reduce((sum, m, idx) => sum + m.height + (idx ? GAP : 0), 0);

      const composites = [];
      const pages = [];
      let y = 0;
      for (const meta of group) {
        composites.push({ input: path.join(pagesDir, meta.name), top: y, left: 0 });
        pages.push([y, meta.height]);
        y += meta.height + GAP;
      }

      const file = `b${String(i + 1).padStart(3, '0')}.webp`;
      const buffer = await sharp({
        create: { width: stripWidth, height, channels: 3, background: '#ffffff' },
      })
        .composite(composites)
        .webp({ quality, effort: 2 })
        .toBuffer();

      await fsp.writeFile(path.join(outDir, file), buffer);
      totalBytes += buffer.length;
      indexStrips[i] = { file, pages };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  const index = {
    slug,
    mode,
    count: sizes.length,
    pageW,
    pageH,
    strips: indexStrips,
  };
  await fsp.mkdir(path.dirname(indexPath), { recursive: true });
  await fsp.writeFile(indexPath, JSON.stringify(index), 'utf8');

  return { slug, mode, count: sizes.length, strips: groups.length, bytes: totalBytes, pageW, pageH };
}

/**
 * Bundle semua buku yang sudah dirender.
 * @param {object} options
 * @param {string} options.pagesRoot   public/pages
 * @param {string} options.sheetsRoot  public/sheets
 * @param {string} options.indexRoot   data/pages
 * @param {'sheets'|'images'} [options.mode]
 */
export async function bundleAll({
  pagesRoot,
  sheetsRoot,
  indexRoot,
  mode = 'sheets',
  maxPages = 3,
  maxHeight = DEFAULT_MAX_HEIGHT,
  quality = 78,
  concurrency = 6,
  onProgress,
}) {
  const dirs = await fsp.readdir(pagesRoot, { withFileTypes: true });
  const slugs = dirs.filter((d) => d.isDirectory()).map((d) => d.name);

  const results = [];
  for (const slug of slugs) {
    const result = await bundleBook(
      path.join(pagesRoot, slug),
      path.join(sheetsRoot, slug),
      path.join(indexRoot, `${slug}.json`),
      { slug, mode, maxPages, maxHeight, quality, concurrency },
    );
    if (!result) continue;
    results.push(result);
    onProgress?.(result);
  }
  return results;
}
