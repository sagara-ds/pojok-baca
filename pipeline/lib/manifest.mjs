import crypto from 'node:crypto';
import path from 'node:path';

import { DATA_DIR, ROOT } from '../config.mjs';
import { authorKey, resolveMeta, slugBaseFor, titleKey, uniqueSlug } from './naming.mjs';
import { readJson, writeJson } from './util.mjs';

const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
const LINKS_FILE = path.join(DATA_DIR, 'links.private.json');
const OVERRIDE_FILE = path.join(DATA_DIR, 'books.override.json');

export const BOOKS_PATH = BOOKS_FILE;
export const LINKS_PATH = LINKS_FILE;

function newDlId() {
  return `dl_${crypto.randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
}

/**
 * Normalisasi links tersimpan -> { slug: { dlId } }.
 *
 * File links.private.json disimpan berformat dlId -> { slug, ... } (format
 * keluaran), sedangkan stabilisator di dalam buildManifest mencari
 * berformat slug -> { dlId }. Tanpa konversi ini, tiap run manifest
 * menganggap semua slug belum punya dlId dan meng-generate ulang semuanya —
 * memutus konsistensi dengan file PDF yang sudah disalin ke public/dl/.
 *
 * Kedua format diterima supaya fungsi ini tahan terhadap file lama.
 */
function denormalizeLinks(saved = {}) {
  const links = {};
  for (const [key, entry] of Object.entries(saved)) {
    if (!entry || typeof entry !== 'object') continue;
    if (key.startsWith('dl_')) {
      // Format dlId -> { slug, ... }
      if (typeof entry.slug === 'string' && entry.slug) links[entry.slug] = { dlId: key };
    } else if (typeof entry.dlId === 'string' && entry.dlId) {
      // Format slug -> { dlId, ... }
      links[key] = { dlId: entry.dlId };
    }
  }
  return links;
}

/**
 * Susun manifest buku final.
 *
 * @param {object} input
 * @param {Array} input.driveFiles   daftar file dari Drive
 * @param {object} input.scan        hasil scan per driveId
 * @param {object} input.render      hasil render per slug
 * @param {Array} input.groups       hasil pengelompokan duplikat
 * @param {object} input.previousLinks links lama (untuk menjaga dlId tetap stabil)
 */
export async function buildManifest({ driveFiles, scan, render, groups, previousLinks, slugById }) {
  const override = (await readJson(OVERRIDE_FILE, {})) ?? {};
  // Abaikan key dokumentasi (prefix "_").
  const overrides = Object.fromEntries(
    Object.entries(override).filter(([key]) => !key.startsWith('_')),
  );
  const links = denormalizeLinks(previousLinks);

  // Indeks reader (dihasilkan pipe:bundle) berisi ukuran halaman & mode delivery.
  const INDEX_DIR = path.join(ROOT, 'public', 'data', 'pages');

  const takenSlugs = new Set();
  const books = [];
  const driveIdBySlug = {};
  const skipped = [];

  for (const group of groups) {
    const representative = group.members.find((m) => m.id === group.representative) ?? group.members[0];
    const driveFile = driveFiles.find((f) => f.id === representative.id);
    if (!driveFile) {
      skipped.push({ id: representative.id, reason: 'file Drive tidak ditemukan' });
      continue;
    }

    const scanData = scan[representative.id] ?? {};
    const parsed = scanData.parsed ?? {};
    const meta = scanData.meta ?? {};

    const slugBase = slugBaseFor(meta, parsed);
    // Slug harus sama persis dengan yang dipakai saat render -> ambil dari slugMap.
    const slug = slugById?.[representative.id] ?? scanData.slug ?? uniqueSlug(slugBase, takenSlugs);

    const manual = overrides[slug] ?? overrides[driveFile.name] ?? {};
    const resolved = resolveMeta(meta, parsed);
    const title = manual.title ?? resolved.title;
    const author = manual.author ?? resolved.author;
    const synopsis = manual.synopsis ?? scanData.synopsisDraft ?? '';
    const synopsisStatus = manual.synopsis
      ? 'manual'
      : synopsis
        ? 'auto'
        : scanData.hasTextLayer
          ? 'empty'
          : 'no-text-layer';

    const renderData = render[slug] ?? {};
    const pages = scanData.pages ?? renderData.pages ?? 0;

    if (!links[slug]) links[slug] = { dlId: newDlId() };
    const dlId = links[slug].dlId;
    driveIdBySlug[slug] = representative.id;

    const readerIndex = await readJson(path.join(INDEX_DIR, `${slug}.json`), null);

    books.push({
      slug,
      type: scanData.type ?? 'pdf',
      pageW: readerIndex?.pageW ?? 900,
      pageH: readerIndex?.pageH ?? 1316,
      assetMode: readerIndex?.mode ?? 'images',
      title,
      author,
      pages,
      chapters: scanData.chapters?.length ?? 0,
      cover: `/covers/${slug}.webp`,
      hasCover: Boolean(renderData.coverBytes),
      pagePath: `/pages/${slug}/{n}.webp`,
      dlId,
      synopsis,
      synopsisStatus,
      categories: manual.categories ?? [],
      hasTextLayer: Boolean(scanData.hasTextLayer),
      landscapePages: scanData.landscapePages ?? [],
      metaConfidence: manual.title || manual.author ? 'manual' : parsed.confidence ?? 'low',
      sourceFile: driveFile.name,
      pdfSize: scanData.bytes ?? 0,
    });
  }

  books.sort((a, b) => a.title.localeCompare(b.title, 'id'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: books.length,
    books,
  };

  const linkMap = {};
  for (const book of books) {
    linkMap[book.dlId] = {
      slug: book.slug,
      driveId: driveIdBySlug[book.slug],
      pdf: `/dl/${book.dlId}.pdf`,
      pages: book.pages,
    };
  }

  return { manifest, links: linkMap, skipped };
}

/** Tulis manifest + peta link privat + laporan diagnosa. */
export async function writeManifest({ manifest, links, skipped, groups, scan, render }) {
  await writeJson(BOOKS_FILE, manifest);
  await writeJson(LINKS_FILE, links);

  const duplicates = groups
    .filter((g) => g.duplicates.length > 0)
    .map((g) => ({
      representative: g.representative,
      kept: g.members.find((m) => m.id === g.representative)?.name,
      dropped: g.duplicates.map((d) => ({
        name: d.name,
        pages: d.pages,
        bytes: d.bytes,
        reason: d.reason,
      })),
    }));

  const toMetaRow = (b) => ({
    slug: b.slug,
    title: b.title,
    author: b.author,
    file: b.sourceFile,
  });

  // "low" = benar-benar perlu diperiksa manual.
  // "medium" = pola "X - Y" yang sudah diputuskan metadata, tapi tetap layak dicek.
  const lowConfidence = manifest.books.filter((b) => b.metaConfidence === 'low').map(toMetaRow);
  const mediumConfidence = manifest.books.filter((b) => b.metaConfidence === 'medium').map(toMetaRow);

  const noSynopsis = manifest.books
    .filter((b) => !b.synopsis)
    .map((b) => ({
      slug: b.slug,
      title: b.title,
      reason: b.synopsisStatus === 'no-text-layer' ? 'tidak ada text layer (scan)' : 'teks tidak cukup',
    }));

  const blankSuspects = Object.entries(render)
    .filter(([, v]) => v.blankPages?.length)
    .map(([slug, v]) => ({ slug, blankPages: v.blankPages, totalPages: v.pages }));

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      driveFiles: Object.keys(scan).length,
      books: manifest.books.length,
      pages: manifest.books.reduce((sum, b) => sum + (b.pages || 0), 0),
      withTextLayer: manifest.books.filter((b) => b.hasTextLayer).length,
      withoutTextLayer: manifest.books.filter((b) => !b.hasTextLayer).length,
      landscapeBooks: manifest.books.filter((b) => b.landscapePages.length > 0).length,
    },
    duplicates,
    lowConfidenceMetadata: lowConfidence,
    mediumConfidenceMetadata: mediumConfidence,
    missingSynopsis: noSynopsis,
    blankPageSuspects: blankSuspects,
    skipped,
  };

  await writeJson(path.join(DATA_DIR, '..', '.cache', 'report.json'), report);
  return report;
}

export { authorKey, titleKey };
