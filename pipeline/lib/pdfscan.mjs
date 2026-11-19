import fsp from 'node:fs/promises';

import { config } from '../config.mjs';

/**
 * Buka PDF dengan MuPDF (WASM). Tidak butuh tool native seperti poppler/ghostscript.
 */
export function openDocument(buffer) {
  // Impor dinamis supaya proses yang tidak butuh PDF tidak membayar biaya inisialisasi WASM.
  return import('mupdf').then((mupdf) => {
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
    return { mupdf, doc };
  });
}

export function isEncrypted(doc) {
  try {
    return typeof doc.needsPassword === 'function' ? doc.needsPassword() : Boolean(doc.needsPassword);
  } catch {
    return false;
  }
}

/**
 * Metadata dokumen (Title/Author). MuPDF memakai format "info:Title".
 * Kembalikan objek dengan nilai string atau undefined.
 */
export function readMetadata(doc) {
  const read = (key) => {
    try {
      const value = doc.getMetaData(`info:${key}`);
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    title: read('Title'),
    author: read('Author'),
    subject: read('Subject'),
    creator: read('Creator'),
    producer: read('Producer'),
  };
}

/** Geometri halaman (dalam poin) + flag landscape. */
export function pageGeometry(doc, index) {
  const page = doc.loadPage(index);
  try {
    const bounds = page.getBounds();
    const width = bounds[2] - bounds[0];
    const height = bounds[3] - bounds[1];
    return { width, height, landscape: width > height };
  } finally {
    page.destroy();
  }
}

/**
 * Render satu halaman menjadi PNG pada lebar target.
 * Mengembalikan buffer PNG + dimensi hasil render.
 *
 * Objek WASM (page & pixmap) dimusnahkan setelah disalin ke buffer JS,
 * supaya memori tidak menumpuk pada run 39.000 halaman.
 */
export function renderPagePng(mupdf, doc, index, targetWidth) {
  const page = doc.loadPage(index);
  let pixmap;
  try {
    const bounds = page.getBounds();
    const pageWidth = bounds[2] - bounds[0];
    const pageHeight = bounds[3] - bounds[1];
    const scale = targetWidth / pageWidth;
    pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false, // alpha
      true, // showExtras (annotation)
    );
    return {
      png: Buffer.from(pixmap.asPNG()),
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
      pageWidth,
      pageHeight,
    };
  } finally {
    pixmap?.destroy?.();
    page.destroy();
  }
}

/**
 * Render satu halaman menjadi piksel RGB mentah pada lebar target.
 *
 * Mengembalikan Buffer RGB (3 kanal) + dimensi.
 *
 * Kenapa bukan PNG: MuPDF hanya bisa mengeluarkan PNG, dan PNG harus
 * dikompresi lalu didekode ulang oleh sharp. Lewati saja tahap itu —
 * piksel mentah dikirim langsung ke sharp sebagai input `raw`. Terukur
 * ~29% lebih cepat, dan ~53% kalau `effort` WebP diturunkan.
 *
 * Objek WASM (page & pixmap) dimusnahkan setelah datanya disalin, supaya
 * memori tidak menumpuk pada run 41.000 halaman.
 */
export function renderPageRaw(mupdf, doc, index, targetWidth) {
  const page = doc.loadPage(index);
  let pixmap;
  try {
    const bounds = page.getBounds();
    const pageWidth = bounds[2] - bounds[0];
    const pageHeight = bounds[3] - bounds[1];
    const scale = targetWidth / pageWidth;
    pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false, // alpha -> 3 kanal (RGB)
      true, // showExtras (annotation)
    );
    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    const components = pixmap.getNumberOfComponents();
    const pixels = pixmap.getPixels();
    // Buffer.from(typedArray) menyalin isi -> wajib, karena memori WASM
    // akan dipakai ulang setelah pixmap dimusnahkan.
    const data = Buffer.from(pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.length));
    return { data, width, height, components, pageWidth, pageHeight };
  } finally {
    pixmap?.destroy?.();
    page.destroy();
  }
}

/**
 * Ekstrak teks layer halaman. Buku hasil scan tidak punya text layer → string kosong.
 */
export function extractPageText(doc, index) {
  let page;
  let stext;
  try {
    page = doc.loadPage(index);
    stext = page.toStructuredText({});
    return stext.asText();
  } catch {
    return '';
  } finally {
    stext?.destroy?.();
    page?.destroy?.();
  }
}

/** Hitung sha256 file (untuk deteksi duplikat persis). */
export async function sha256File(filePath) {
  const hash = await import('node:crypto');
  const buf = await fsp.readFile(filePath);
  return hash.createHash('sha256').update(buf).digest('hex');
}

/**
 * Draft synopsis otomatis dari halaman-halaman awal.
 * Hanya untuk buku yang punya text layer. Hasil dibersihkan & dipotong pada batas kalimat.
 */
export function draftSynopsis(texts, maxChars = config.synopsisMaxChars) {
  const pages = texts
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 120);

  const prose = pages.filter((text) => {
    const head = text.slice(0, 220).toLowerCase();
    const boilerplate =
      /copyright|hak cipta|all rights reserved|dilarang|publish|diterbitkan|isbn|scanned by|copyrighted|dicetak oleh|percetakan|penerbit\b/i;
    if (boilerplate.test(head)) return false;
    // Kontak penerbit: nomor telepon, SMS, WhatsApp, alamat web.
    if (/tel[epp]|sms|wa\s|whatsapp|instagram|facebook|www\.|https?:|e-?mail|alamat/i.test(head)) return false;
    // Halaman penuh angka (alamat, nomor HP, harga) bukan prosa.
    const digits = (text.match(/\d/g) ?? []).length;
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    if (letters && digits / letters > 0.25) return false;
    // Daftar isi: banyak baris pendek diakhiri nomor halaman.
    const tocLines = text.split('\n').filter((l) => /[^\d]\s{2,}\d{1,4}\s*$/.test(l.trim()));
    if (tocLines.length >= 5) return false;
    return true;
  });

  const source = prose.length ? prose : pages;
  if (!source.length) return '';

  let body = source.join(' ').trim();
  if (body.length <= maxChars) return body;

  const slice = body.slice(0, maxChars);
  const lastStop = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  const trimmed = lastStop > 80 ? slice.slice(0, lastStop + 1) : `${slice.trimEnd()}…`;
  return trimmed;
}
