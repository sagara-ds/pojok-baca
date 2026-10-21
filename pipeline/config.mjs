/**
 * Konfigurasi pipeline. Semua path relatif ke root project (satu level di atas pipeline/).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..');
export const CACHE_DIR = path.join(ROOT, '.cache');
export const DATA_DIR = path.join(ROOT, 'data');

export const config = {
  drive: {
    folderId:
      process.env.DRIVE_FOLDER_ID ??
      '1igqBFcVTszzPTSE7roSClbJZXCdKA9in6TgJ-aZT1QiKD9YjA9P8Ke7uibz4Ccb_Bcri3W4F',
    listUrl: 'https://drive.google.com/embeddedfolderview',
    downloadUrl: 'https://drive.usercontent.google.com/download',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    /** Jumlah download paralel. Terlalu tinggi memicu halaman limit Drive "too many users". */
    concurrency: 5,
    retries: 4,
    retryBaseMs: 1500,
    /** Timeout unduhan. Beberapa EPUB di folder sumber berukuran ~100 MB. */
    timeoutMs: 600_000,
  },

  render: {
    /** Lebar target (px). Tinggi mengikuti rasio asli. */
    width: 900,
    /** WebP quality. */
    quality: 78,
    /**
     * WebP encoder effort (0-6). Makin rendah makin cepat, file sedikit lebih
     * besar: effort 4 -> 86 KB/halaman, effort 2 -> 88 KB/halaman (+2%).
     */
    webpEffort: 2,
    /** Jumlah buku yang dirender paralel (tiap proses punya instance mupdf WASM). */
    concurrency: 5,
    /** Jumlah halaman awal yang diperiksa untuk mendeteksi halaman kosong. */
    guardSamplePages: 5,
    /** Lebar thumbnail untuk dHash (deteksi near-duplicate). */
    hashWidth: 64,
  },

  watermark: {
    enabled: true,
    brand: 'POJOK BACA',
    /** Opasitas teks pola. */
    opacity: 0.09,
    /** Opasitas corner mark slug. */
    cornerOpacity: 0.28,
  },

  /** Batas karakter draft synopsis otomatis. */
  synopsisMaxChars: 320,

  /** Toleransi beda jumlah halaman saat membandingkan judul+penulis. */
  dedupePageTolerance: 0.1,
};
