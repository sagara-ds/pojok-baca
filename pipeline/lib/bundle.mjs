import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { ensureDir, humanBytes, log } from './util.mjs';

/**
 * Gabungkan beberapa halaman jadi satu strip gambar vertikal.
 *
 * Dipakai untuk host dengan batas jumlah file (Cloudflare Workers/Pages: 20.000
 * file per deploy). Koleksi ini punya ~39.000 halaman, jadi perlu digabung.
 *
 * Batas tinggi strip: 4096 px. Di atas itu, sebagian browser mobile (iOS
 * Safari) gagal mendekode gambar.
 */

const GAP = 8;

export async function bundleBook(pagesDir, outDir, { maxPages = 3, maxHeight = 4096 } = {}) {
  const entries = (await fsp.readdir(pagesDir))
    .filter((name) => name.endsWith('.webp'))
    .sort();

  if (!entries.length) return null;

  const metas = [];
  for (const name of entries) {
    const meta = await sharp(path.join(pagesDir, name)).metadata();
    metas.push({ name, width: meta.width, height: meta.height });
  }

  const stripWidth = Math.max(...metas.map((m) => m.width));

  // Susun strip: maksimal maxPages halaman dan total tinggi <= maxHeight.
  const strips = [];
  let current = [];
  let currentHeight = 0;

  for (const meta of metas) {
    const addition = meta.height + (current.length ? GAP : 0);
    const tooTall = currentHeight + addition > maxHeight;
    const tooMany = current.length >= maxPages;
    if (current.length && (tooTall || tooMany)) {
      strips.push(current);
      current = [];
      currentHeight = 0;
    }
    currentHeight += current.length ? meta.height + GAP : meta.height;
    current.push(meta);
  }
  if (current.length) strips.push(current);

  await ensureDir(outDir);

  const geometry = [];
  let totalBytes = 0;

  for (let i = 0; i < strips.length; i++) {
    const group = strips[i];
    const width = Math.max(...group.map((m) => m.width));
    const height = group.reduce((sum, m, idx) => sum + m.height + (idx ? GAP : 0), 0);

    const composites = [];
    let y = 0;
    for (const meta of group) {
      composites.push({ input: path.join(pagesDir, meta.name), top: y, left: 0 });
      geometry.push({
        n: Number.parseInt(meta.name, 10),
        file: `b${String(i + 1).padStart(3, '0')}.webp`,
        y,
        h: meta.height,
        w: meta.width,
      });
      y += meta.height + GAP;
    }

    const outFile = path.join(outDir, `b${String(i + 1).padStart(3, '0')}.webp`);
    const buffer = await sharp({
      create: { width: stripWidth, height, channels: 3, background: '#ffffff' },
    })
      .composite(composites)
      .webp({ quality: 78 })
      .toBuffer();

    await fsp.writeFile(outFile, buffer);
    totalBytes += buffer.length;
  }

  return { strips: strips.length, pages: metas.length, bytes: totalBytes, geometry };
}

/**
 * Bundle semua buku yang sudah dirender.
 * @param {string} pagesRoot  public/pages
 * @param {string} sheetsRoot public/sheets
 * @param {string} geometryDir data/geometry
 */
export async function bundleAll({ pagesRoot, sheetsRoot, geometryDir, maxPages, maxHeight }) {
  const slugs = await fsp.readdir(pagesRoot, { withFileTypes: true });
  const dirs = slugs.filter((d) => d.isDirectory()).map((d) => d.name);

  const results = [];
  for (const slug of dirs) {
    const result = await bundleBook(path.join(pagesRoot, slug), path.join(sheetsRoot, slug), {
      maxPages,
      maxHeight,
    });
    if (!result) continue;
    await ensureDir(geometryDir);
    await fsp.writeFile(
      path.join(geometryDir, `${slug}.json`),
      JSON.stringify({ slug, strips: result.strips, pages: result.pages, geometry: result.geometry }),
      'utf8',
    );
    results.push({ slug, ...result });
  }
  return results;
}

export { humanBytes, log };
