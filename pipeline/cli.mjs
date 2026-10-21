#!/usr/bin/env node
/**
 * Pipeline CLI: Google Drive (PDF) -> WebP per halaman -> manifest books.json
 *
 * Perintah:
 *   list      Enumerasi isi folder Drive publik
 *   fetch     Unduh semua PDF ke .cache/pdf/
 *   scan      Periksa tiap PDF (halaman, sha256, dHash, text layer, metadata)
 *   render    Render tiap buku jadi WebP + watermark ke public/
 *   manifest  Susun data/books.json, data/links.private.json, .cache/report.json
 *   all       list -> fetch -> scan -> render -> manifest
 *   bundle    Gabung beberapa halaman jadi 1 file (untuk host dengan limit jumlah file)
 */

import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import * as mupdf from 'mupdf';

import { CACHE_DIR, DATA_DIR, ROOT, config } from './config.mjs';
import { downloadAll, listFolder } from './lib/drive.mjs';
import { groupDuplicates } from './lib/dedupe.mjs';
import { dhash, blankScore } from './lib/image.mjs';
import { extractEpubFile, parseEpub } from './lib/epub.mjs';
import {
  draftSynopsis,
  extractPageText,
  isEncrypted,
  openDocument,
  pageGeometry,
  readMetadata,
  renderPageRaw,
} from './lib/pdfscan.mjs';
import { buildManifest, writeManifest } from './lib/manifest.mjs';
import { bundleBook } from './lib/bundle.mjs';
import { authorKey, parseFileName, slugBaseFor, slugify, titleKey, uniqueSlug } from './lib/naming.mjs';
import { buildWatermarkSvg } from './lib/watermark.mjs';
import { ensureDir, humanBytes, log, parseArgs, readJson, writeJson } from './lib/util.mjs';

const DRIVE_FILE = path.join(CACHE_DIR, 'drive.json');
const SCAN_FILE = path.join(CACHE_DIR, 'scan.json');
const GROUPS_FILE = path.join(CACHE_DIR, 'groups.json');
const RENDER_FILE = path.join(CACHE_DIR, 'render.json');
const PDF_DIR = path.join(CACHE_DIR, 'pdf');
const PAGES_DIR = path.join(ROOT, 'public', 'pages');
const COVERS_DIR = path.join(ROOT, 'public', 'covers');

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'help';

function pageFileName(index) {
  return `${String(index + 1).padStart(3, '0')}.webp`;
}

/** Ekstensi asli file Drive (pdf / epub / ...). */
function extOf(name) {
  const match = String(name).match(/\.([a-zA-Z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : '.pdf';
}

/**
 * Lokasi file sumber di cache.
 * Fallback ke .pdf untuk file yang terunduh sebelum penamaan berbasis ekstensi.
 */
async function sourcePath(file) {
  const primary = path.join(PDF_DIR, `${file.id}${extOf(file.name)}`);
  const exists = await fsp.stat(primary).then(() => true).catch(() => false);
  if (exists) return primary;
  const fallback = path.join(PDF_DIR, `${file.id}.pdf`);
  const fallbackExists = await fsp.stat(fallback).then(() => true).catch(() => false);
  return fallbackExists ? fallback : primary;
}

/** Jalankan tasks dengan batas konkurensi. */
async function pool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
async function cmdList() {
  log.step('Mengambil daftar file dari folder Drive…');
  const { title, files } = await listFolder(args['folder-id']);
  await writeJson(DRIVE_FILE, { title, files, listedAt: new Date().toISOString() });
  log.ok(`Folder: ${title}`);
  log.info(`  ${files.length} file ditemukan -> ${path.relative(ROOT, DRIVE_FILE)}`);
  for (const file of files.slice(0, 12)) {
    log.dim(`  ${file.id}  ${file.name}`);
  }
  if (files.length > 12) log.dim(`  … ${files.length - 12} file lainnya`);
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------
async function cmdFetch() {
  const drive = await readJson(DRIVE_FILE);
  if (!drive) throw new Error('Jalankan `list` lebih dulu (.cache/drive.json belum ada).');

  const limit = args.limit ? Number(args.limit) : Infinity;
  const targets = drive.files.slice(0, limit);

  log.step(`Mengunduh ${targets.length} PDF…`);
  let done = 0;
  let bytes = 0;
  const errors = [];

  const results = await downloadAll(targets, {
    getDest: (file) => path.join(PDF_DIR, `${file.id}${extOf(file.name)}`),
    onDone: ({ bytes: size, cached, name }) => {
      done++;
      bytes += size;
      log.dim(`[${done}/${targets.length}] ${cached ? 'cache' : 'baru  '} ${humanBytes(size).padStart(9)}  ${name.slice(0, 60)}`);
    },
    onError: ({ file, error, attempt, backoff }) => {
      errors.push({ name: file.name, error });
      if (attempt) log.warn(`retry ${attempt} (${Math.round(backoff)}ms) ${file.name.slice(0, 40)}`);
    },
  });

  const failed = results.filter((r) => r.error);
  const totalBytes = results.reduce((sum, r) => sum + (r.bytes || 0), 0);
  log.ok(`${results.length - failed.length}/${results.length} PDF terunduh (${humanBytes(totalBytes)})`);
  if (failed.length) {
    log.warn(`${failed.length} gagal:`);
    for (const f of failed) log.dim(`  ${f.name.slice(0, 50)} — ${f.error}`);
  }
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------
async function cmdScan() {
  const drive = await readJson(DRIVE_FILE);
  if (!drive) throw new Error('Jalankan `list` lebih dulu.');

  const limit = args.limit ? Number(args.limit) : Infinity;
  const onlyFilter = args.only ? new RegExp(String(args.only), 'i') : null;
  const targets = drive.files
    .filter((f) => (onlyFilter ? onlyFilter.test(f.name) : true))
    .slice(0, limit);

  log.step(`Memindai ${targets.length} PDF (halaman, sha256, dHash, text layer)…`);
  const scan = (await readJson(SCAN_FILE, {})) ?? {};
  let done = 0;

  await pool(targets, Number(args.concurrency ?? config.render.concurrency), async (file) => {
    const pdfPath = await sourcePath(file);
    try {
      const stat = await fsp.stat(pdfPath);
      const buffer = await fsp.readFile(pdfPath);
      const isEpub = /\.epub$/i.test(file.name);
      if (isEpub) {
        // EPUB punya lapisan teks asli -> served sebagai teks di reader,
        // bukan dirender jadi gambar.
        const epub = parseEpub(buffer);
        const fromName = parseFileName(file.name);
        // Beberapa EPUBMENTAH dc:title berisi path Windows konverter,
        // mis. "D:\wwwroot\cleverpdf-web\1516486\Judul by Penulis.epub".
        const rawTitle = epub.title ?? '';
        const titleIsPath = /[\\/]|\.epub\s*$/i.test(rawTitle);
        scan[file.id] = {
          driveId: file.id,
          name: file.name,
          type: 'epub',
          bytes: stat.size,
          sha256: (await import('node:crypto')).createHash('sha256').update(buffer).digest('hex'),
          parsed: fromName,
          meta: {
            title: titleIsPath ? fromName.title : rawTitle || fromName.title,
            author: titleIsPath ? fromName.author : epub.author || fromName.author,
          },
          pages: 0,
          hasTextLayer: true,
          textChars: epub.chapters.length,
          landscapePages: [],
          chapters: epub.chapters,
          coverPath: epub.coverPath,
          synopsisDraft: '',
        };
      } else {
        const { doc } = await openDocument(buffer);

        const encrypted = isEncrypted(doc);
        if (encrypted) {
          scan[file.id] = {
            driveId: file.id,
            name: file.name,
            type: 'pdf',
            bytes: stat.size,
            encrypted: true,
            error: 'PDF terenkripsi (butuh password)',
          };
        } else {
          const pages = doc.countPages();
          const meta = readMetadata(doc);
          const parsed = parseFileName(file.name);

          // dHash cover untuk deteksi near-duplicate.
          let hash = '';
          try {
            const cover = renderPagePng(mupdf, doc, 0, config.render.hashWidth);
            hash = await dhash(cover.png);
          } catch {
            /* cover gagal dirender -> hash kosong */
          }

          // Probe text layer: buku hasil scan tidak punya teks.
          const probeEnd = Math.min(pages, 12);
          const texts = [];
          for (let i = 1; i < probeEnd; i++) texts.push(extractPageText(doc, i));
          const textChars = texts.join(' ').replace(/\s+/g, '').length;
          const hasTextLayer = textChars > 200;

          // Halaman landscape (mis. spread 2 halaman) -> jangan dirotasi, cukup ditandai.
          const landscapePages = [];
          for (let i = 0; i < pages; i++) {
            if (pageGeometry(doc, i).landscape) landscapePages.push(i + 1);
          }

          scan[file.id] = {
            driveId: file.id,
            name: file.name,
            type: 'pdf',
            bytes: stat.size,
            pages,
            sha256: (await import('node:crypto')).createHash('sha256').update(buffer).digest('hex'),
            dhash: hash,
            parsed,
            meta,
            hasTextLayer,
            textChars,
            landscapePages,
            synopsisDraft: hasTextLayer ? draftSynopsis(texts) : '',
          };
          doc.destroy?.();
        }
      }
      done++;
      const pct = ((done / targets.length) * 100).toFixed(0);
      log.dim(`[${done}/${targets.length}] ${String(pct).padStart(3)}% ${file.name.slice(0, 58)}`);
    } catch (err) {
      scan[file.id] = { driveId: file.id, name: file.name, error: err.message };
      done++;
      log.warn(`${file.name.slice(0, 50)} — ${err.message}`);
    }
  });

  // Kelompokkan duplikat & tetapkan slug untuk masing-masing kelompok.
  const entries = Object.values(scan)
    .filter((s) => !s.error)
    .map((s) => ({
      id: s.driveId,
      name: s.name,
      pages: s.pages,
      bytes: s.bytes,
      sha256: s.sha256,
      dhash: s.dhash,
      titleKey: titleKey(s.meta?.title || s.parsed?.title || ''),
      authorKey: authorKey(s.meta?.author || s.parsed?.author || ''),
    }));

  const groups = groupDuplicates(entries);
  const taken = new Set();
  const slugMap = {};
  const overrides = (await readJson(path.join(DATA_DIR, 'books.override.json'), {})) ?? {};
  // Urut stabil supaya slug tidak berubah antar-run.
  for (const group of [...groups].sort((a, b) =>
    (a.members.find((m) => m.id === a.representative)?.name ?? '').localeCompare(
      b.members.find((m) => m.id === b.representative)?.name ?? '',
    ),
  )) {
    const rep = group.members.find((m) => m.id === group.representative) ?? group.members[0];
    const scanData = scan[rep.id];
    const computed = slugBaseFor(scanData?.meta, scanData?.parsed);
    // Override manual boleh mengganti slug (mis. membuang prefix tag "{SB}").
    // Key override boleh berupa slug lama ATAU nama file sumber (stabil).
    const manual = overrides[computed] ?? overrides[rep.name] ?? {};
    const slug = uniqueSlug(manual.slug ?? computed, taken);
    slugMap[rep.id] = slug;
    for (const member of group.members) {
      if (member.id !== rep.id) slugMap[member.id] = slug; // duplikat -> slug yang sama
    }
  }

  await writeJson(SCAN_FILE, scan);
  await writeJson(GROUPS_FILE, { groups, slugMap });

  const uniqueBooks = groups.length;
  const dupGroups = groups.filter((g) => g.duplicates.length > 0);
  log.ok(`${uniqueBooks} buku unik dari ${targets.length} file (${dupGroups.length} kelompok duplikat)`);
  for (const g of dupGroups.slice(0, 10)) {
    const kept = g.members.find((m) => m.id === g.representative);
    log.dim(`  ${kept.name.slice(0, 48)}  (+${g.duplicates.length} salinan)`);
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
async function cmdRender() {
  const groupsData = await readJson(GROUPS_FILE);
  const scan = await readJson(SCAN_FILE);
  if (!groupsData || !scan) throw new Error('Jalankan `scan` lebih dulu.');

  const renderState = (await readJson(RENDER_FILE, {})) ?? {};
  const targets = groupsData.groups
    .map((g) => g.members.find((m) => m.id === g.representative) ?? g.members[0])
    .filter((m) => {
      const slug = groupsData.slugMap[m.id];
      return slug && scan[m.id] && !scan[m.id].error;
    });

  let only = args.slug ? targets.filter((m) => groupsData.slugMap[m.id] === args.slug) : targets;

  // Daftar slug dari file (satu slug per baris).
  if (args['slugs-file']) {
    const list = (await fsp.readFile(args['slugs-file'], 'utf8'))
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const set = new Set(list);
    only = only.filter((m) => set.has(groupsData.slugMap[m.id]));
    log.info(`memproses ${only.length} slug dari ${args['slugs-file']}`);
  }
  const limit = args.limit ? Number(args.limit) : Infinity;
  let selected = only.slice(0, limit);

  // Retry hanya buku yang gagal di run sebelumnya.
  if (args['retry-failed']) {
    const failed = new Set(
      Object.values(renderState)
        .filter((r) => r.error)
        .map((r) => r.slug),
    );
    selected = selected.filter((m) => failed.has(groupsData.slugMap[m.id]));
    log.warn(`Mode retry: ${selected.length} buku gagal sebelumnya`);
  }

  log.step(`Render ${selected.length} buku -> WebP ${config.render.width}px q${config.render.quality}`);
  let done = 0;
  let totalPages = 0;
  let totalBytes = 0;

  await pool(selected, Number(args.concurrency ?? config.render.concurrency), async (member) => {
    const slug = groupsData.slugMap[member.id];
    const scanData = scan[member.id];
    const isEpub = scanData.type === 'epub';
    const pdfPath = await sourcePath({ id: member.id, name: member.name });
    const outDir = path.join(PAGES_DIR, slug);

    try {
      await ensureDir(outDir);
      const buffer = await fsp.readFile(pdfPath);

      if (isEpub) {
        // EPUB tidak dirender jadi gambar: reader menyajikan teksnya.
        // Yang diekstrak hanya cover.
        await ensureDir(COVERS_DIR);
        const coverRaw = scanData.coverPath ? extractEpubFile(buffer, scanData.coverPath) : null;
        let coverBytes = 0;
        if (coverRaw) {
          const coverWebp = await sharp(coverRaw)
            .resize({ width: 400, withoutEnlargement: true })
            .webp({ quality: config.render.quality })
            .toBuffer();
          await fsp.writeFile(path.join(COVERS_DIR, `${slug}.webp`), coverWebp);
          coverBytes = coverWebp.length;
        }
        renderState[slug] = {
          slug,
          driveId: member.id,
          type: 'epub',
          pages: 0,
          chapters: scanData.chapters?.length ?? 0,
          bytes: scanData.bytes ?? 0,
          coverBytes,
          blankPages: [],
          watermark: false,
        };
        done++;
        totalBytes += scanData.bytes ?? 0;
        log.dim(`[${done}/${selected.length}] ${slug.padEnd(34)} epub  ${String(scanData.chapters?.length ?? 0).padStart(3)} bab  ${humanBytes(scanData.bytes ?? 0)}`);
        return;
      }

      const { doc } = await openDocument(buffer);
      const pages = doc.countPages();

      const blankPages = [];
      let bytes = 0;
      let coverBytes = 0;

      try {
        for (let i = 0; i < pages; i++) {
          const outFile = path.join(outDir, pageFileName(i));

          // --resume: lewati halaman yang sudah ada (render ulang jadi jauh lebih cepat).
          if (args.resume) {
            const existing = await fsp.stat(outFile).catch(() => null);
            if (existing && existing.size > 0) {
              bytes += existing.size;
              continue;
            }
          }

          const rendered = renderPageRaw(mupdf, doc, i, config.render.width);
          const outWidth = Math.min(config.render.width, rendered.width);
          const outHeight = Math.round((rendered.height * outWidth) / rendered.width);

          const overlay = config.watermark.enabled
            ? [{ input: buildWatermarkSvg({ width: outWidth, height: outHeight, slug }) }]
            : [];

          const webp = await sharp(rendered.data, {
            raw: { width: rendered.width, height: rendered.height, channels: rendered.components },
          })
            .resize({ width: outWidth, withoutEnlargement: true })
            .composite(overlay)
            .webp({ quality: config.render.quality, effort: config.render.webpEffort })
            .toBuffer();

          await fsp.writeFile(outFile, webp);
          bytes += webp.length;

          // Guard: cek halaman nyaris kosong pada sampel awal.
          if (i < config.render.guardSamplePages) {
            const { stdev, isBlank } = await blankScore(webp);
            if (isBlank) blankPages.push({ page: i + 1, stdev: Number(stdev.toFixed(2)) });
          }
        }

        // Cover kecil untuk daftar buku.
        const cover = renderPageRaw(mupdf, doc, 0, 400);
        const coverWidth = Math.min(400, cover.width);
        const coverHeight = Math.round((cover.height * coverWidth) / cover.width);
        const coverWebp = await sharp(cover.data, {
          raw: { width: cover.width, height: cover.height, channels: cover.components },
        })
          .resize({ width: coverWidth, withoutEnlargement: true })
          .composite(
            config.watermark.enabled
              ? [{ input: buildWatermarkSvg({ width: coverWidth, height: coverHeight, slug }) }]
              : [],
          )
          .webp({ quality: config.render.quality, effort: config.render.webpEffort })
          .toBuffer();
        await ensureDir(COVERS_DIR);
        await fsp.writeFile(path.join(COVERS_DIR, `${slug}.webp`), coverWebp);
        coverBytes = coverWebp.length;
      } finally {
        doc.destroy?.();
      }

      renderState[slug] = {
        slug,
        driveId: member.id,
        pages,
        bytes,
        coverBytes,
        blankPages,
        watermark: config.watermark.enabled,
      };
      done++;
      totalPages += pages;
      totalBytes += bytes;
      const avg = Math.round(bytes / pages / 1024);
      log.dim(`[${done}/${selected.length}] ${slug.padEnd(34)} ${String(pages).padStart(4)} hal  ${String(avg).padStart(4)} KB/hal  ${humanBytes(bytes)}`);
    } catch (err) {
      renderState[slug] = { slug, driveId: member.id, error: err.message };
      done++;
      log.warn(`${slug} — ${err.message}`);
    }
  });

  await writeJson(RENDER_FILE, renderState);

  const blanks = Object.values(renderState).filter((r) => r.blankPages?.length);
  log.ok(`${done} buku dirender (${totalPages} halaman, ${humanBytes(totalBytes)})`);
  if (blanks.length) {
    log.warn(`${blanks.length} buku punya halaman nyaris kosong (kemungkinan decoder gambar gagal):`);
    for (const b of blanks) log.dim(`  ${b.slug} → halaman ${b.blankPages.map((p) => p.page).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------
async function cmdManifest() {
  const drive = await readJson(DRIVE_FILE);
  const scan = await readJson(SCAN_FILE);
  const groupsData = await readJson(GROUPS_FILE);
  const render = (await readJson(RENDER_FILE, {})) ?? {};
  if (!drive || !scan || !groupsData) throw new Error('Jalankan list/fetch/scan lebih dulu.');

  log.step('Menyusun manifest buku…');
  const previousLinks = await readJson(path.join(DATA_DIR, 'links.private.json'), {});
  const { manifest, links, skipped } = await buildManifest({
    driveFiles: drive.files,
    scan,
    render,
    groups: groupsData.groups,
    previousLinks,
    slugById: groupsData.slugMap,
  });

  const report = await writeManifest({ manifest, links, skipped, groups: groupsData.groups, scan, render });

  log.ok(`${manifest.count} buku -> data/books.json`);
  log.dim(`  total halaman : ${report.totals.pages}`);
  log.dim(`  ada text layer: ${report.totals.withTextLayer}`);
  log.dim(`  duplikat      : ${report.duplicates.length} kelompok`);
  log.dim(`  perlu review  : ${report.lowConfidenceMetadata.length} (metadata) / ${report.missingSynopsis.length} (sinopsis)`);
  if (report.blankPageSuspects.length) {
    log.warn(`${report.blankPageSuspects.length} buku suspect halaman kosong`);
  }
}

// ---------------------------------------------------------------------------
// all
// ---------------------------------------------------------------------------
async function cmdAll() {
  await cmdList();
  await cmdFetch();
  await cmdScan();
  await cmdRender();
  await cmdManifest();
}

// ---------------------------------------------------------------------------
// pdf
// ---------------------------------------------------------------------------
async function cmdPdf() {
  const links = await readJson(path.join(DATA_DIR, 'links.private.json'));
  const drive = await readJson(DRIVE_FILE);
  if (!links || !drive) throw new Error('Jalankan `manifest` lebih dulu.');

  const maxMb = Number(args['max-mb'] ?? 25);
  const limitBytes = maxMb * 1024 * 1024;
  const outDir = path.join(ROOT, 'public', 'dl');

  log.step(`Menyalin PDF ke public/dl/ (maks ${maxMb} MB per file)…`);
  await ensureDir(outDir);

  const byId = new Map(drive.files.map((f) => [f.id, f]));
  let copied = 0;
  let skipped = 0;
  let totalBytes = 0;

  for (const [dlId, entry] of Object.entries(links)) {
    const file = entry.driveId ? byId.get(entry.driveId) : null;
    if (!file) {
      skipped++;
      continue;
    }
    const src = await sourcePath(file);
    const stat = await fsp.stat(src).catch(() => null);
    if (!stat) {
      skipped++;
      continue;
    }
    if (stat.size > limitBytes) {
      log.dim(`  lewati ${entry.slug} — ${humanBytes(stat.size)} > ${maxMb} MB`);
      skipped++;
      continue;
    }
    await fsp.copyFile(src, path.join(outDir, `${dlId}.pdf`));
    copied++;
    totalBytes += stat.size;
  }

  log.ok(`${copied} PDF disalin (${humanBytes(totalBytes)}), ${skipped} dilewati`);
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------
async function cmdVerify() {
  const manifest = await readJson(path.join(DATA_DIR, 'books.json'));
  if (!manifest) throw new Error('Jalankan `manifest` lebih dulu.');

  log.step(`Memeriksa ${manifest.count} buku di public/…`);
  let ok = 0;
  const problems = [];

  for (const book of manifest.books) {
    const issues = [];

    if (book.type === 'epub') {
      if (book.chapters === 0) issues.push('tidak ada bab');
    } else {
      const dir = path.join(PAGES_DIR, book.slug);
      const files = await fsp.readdir(dir).catch(() => null);
      if (!files) {
        issues.push('folder halaman tidak ada');
      } else {
        const webps = files.filter((f) => f.endsWith('.webp'));
        if (webps.length !== book.pages) {
          issues.push(`halaman ${webps.length}/${book.pages}`);
        }
        let tooSmall = 0;
        for (const f of webps) {
          const st = await fsp.stat(path.join(dir, f));
          if (st.size < 1024) tooSmall++;
        }
        if (tooSmall) issues.push(`${tooSmall} halaman < 1KB (kemungkinan kosong)`);
      }
    }

    const cover = path.join(COVERS_DIR, `${book.slug}.webp`);
    const coverStat = await fsp.stat(cover).catch(() => null);
    if (!coverStat) issues.push('cover tidak ada');

    if (issues.length) problems.push({ slug: book.slug, issues });
    else ok++;
  }

  log.ok(`${ok}/${manifest.count} buku lengkap`);
  if (problems.length) {
    log.warn(`${problems.length} buku bermasalah:`);
    for (const p of problems.slice(0, 30)) log.dim(`  ${p.slug}: ${p.issues.join('; ')}`);
  }

  const pages = await fsp.readdir(PAGES_DIR).catch(() => []);
  let totalFiles = 0;
  let totalBytes = 0;
  for (const slug of pages) {
    const files = await fsp.readdir(path.join(PAGES_DIR, slug)).catch(() => []);
    for (const f of files) {
      const st = await fsp.stat(path.join(PAGES_DIR, slug, f)).catch(() => null);
      if (st) {
        totalFiles++;
        totalBytes += st.size;
      }
    }
  }
  log.dim(`halaman: ${totalFiles} file, ${humanBytes(totalBytes)}`);
  if (problems.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// bundle
// ---------------------------------------------------------------------------
async function cmdBundle() {
  const maxPages = Number(args.pages ?? 3);
  const maxHeight = Number(args['max-height'] ?? 4096);
  const only = args.slug ? [args.slug] : null;

  log.step(`Menggabung halaman jadi strip (maks ${maxPages} hal/strip, tinggi maks ${maxHeight}px)…`);

  const sheetsRoot = path.join(ROOT, 'public', 'sheets');
  const geometryDir = path.join(DATA_DIR, 'geometry');
  const slugs = only ?? (await fsp.readdir(PAGES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let totalPages = 0;
  let totalStrips = 0;
  let totalBytes = 0;

  for (const slug of slugs) {
    const result = await bundleBook(path.join(PAGES_DIR, slug), path.join(sheetsRoot, slug), {
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
    totalPages += result.pages;
    totalStrips += result.strips;
    totalBytes += result.bytes;
    log.dim(`${slug.padEnd(34)} ${String(result.pages).padStart(4)} hal -> ${String(result.strips).padStart(3)} strip  ${humanBytes(result.bytes)}`);
  }

  log.ok(`${totalPages} halaman -> ${totalStrips} strip (${humanBytes(totalBytes)})`);
  log.dim(`  geo: ${path.relative(ROOT, geometryDir)}/<slug>.json`);
}

// ---------------------------------------------------------------------------

const commands = {
  list: cmdList,
  fetch: cmdFetch,
  scan: cmdScan,
  render: cmdRender,
  manifest: cmdManifest,
  pdf: cmdPdf,
  verify: cmdVerify,
  bundle: cmdBundle,
  all: cmdAll,
};

if (!commands[command]) {
  console.log(`
Pojok Baca — pipeline CLI

  node pipeline/cli.mjs <perintah> [opsi]

Perintah:
  list       Enumerasi isi folder Drive publik
  fetch      Unduh semua PDF ke .cache/pdf/
  scan       Periksa PDF: halaman, sha256, dHash, text layer, metadata
  render     Render WebP + watermark ke public/pages & public/covers
  manifest   Tulis data/books.json + data/links.private.json + laporan
  pdf        Salin PDF asli ke public/dl/<dlId>.pdf (nama acak)
  bundle     Gabungkan halaman jadi strip (untuk host dengan limit jumlah file)
  all        Jalankan semua berurutan

Opsi:
  --limit N            Batasi jumlah file (untuk uji coba)
  --slug <slug>        Hanya proses satu buku
  --concurrency N      Jumlah proses paralel
  --pages N            Halaman per strip (untuk bundle)
  --max-mb N           Batas ukuran PDF saat menyalin (default 25)
  --retry-failed       Render ulang hanya buku yang gagal
  --only <regex>       Batasi scan ke nama file yang cocok
  --folder-id <id>     Ganti folder Drive
`);
  process.exit(0);
}

try {
  await commands[command]();
} catch (err) {
  log.err(err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}
