# API Integration — Katalog Lokal (hasil pipeline)

> **Riwayat:** pernah mencoba welib.org (lineage Anna's Archive) — Cloudflare
> memblokir akses server-side (HTTP 403). Sempat integrasi Open Library &
> skeleton Google Books di `feat/openlibrary-integration`, lalu **dihapus** di
> `feat/data-lokal` karena keputusan proyek: **tanpa API dari web manapun,
> pembangunan koleksi lokal**.
>
> **2026-10-21:** mock 24 buku diganti **koleksi asli** dari pipeline
> `feat/pipeline-koleksi` → `data/books.json` (140 buku).

## 📡 Sumber Data
**Tunggal & lokal:** `data/books.json`
- 140 buku hasil deduplikasi dari 154 file di folder Google Drive
  (147 PDF + 7 EPUB), 41.669 halaman
- Cover: `/covers/<slug>.webp` (400 px, hasil render + watermark), fallback
  `/book-placeholder.svg`
- Halaman: `/pages/<slug>/001.webp` … (900 px, WebP q78, ber-watermark)
- `readingUrl` → route internal `/books/{slug}/read`

## 🧩 Antarmuka (`src/services/api.ts`)
| Fungsi | Delegasi ke | Dipakai |
|--------|-------------|---------|
| `fetchBooks(params)` | `getAllBooks()` + filter/paginasi/sort | `pages/books/index.astro` |
| `fetchBook(slug)` | `getBook(slug)` | `pages/books/[slug].astro` |
| `searchBooks(query, params)` | `searchBooksLocal()` | (siap untuk pencarian) |
| `fetchCategories()` | `getCategories()` | (siap untuk filter kategori) |
| `sanitizeHtml(text)` / `sanitizeText(text)` | utility lokal | `BookDescription`, `BookMeta`, `[slug]` |

Adapter manifest → UI ada di `src/services/books.ts`. Antarmuka sengaja
dijaga supaya.pages tidak berubah.

## 🔁 Regenerasi katalog

```bash
npm run pipe:all        # list → fetch → scan → render → manifest
npm run pipe:manifest   # saja, kalau render sudah selesai
npm run pipe:verify     # cek kelengkapan output
```

Override manual: `data/books.override.json` (key = slug **atau** nama file
sumber). Dipakai untuk memperbaiki judul/penulis/sinopsis/kategori, dan untuk
mengganti slug yang berantakan.

## ⚠️ Catatan metadata

- Mayoritas PDF hasil **scan** → **tidak punya text layer** → synopsis kosong
  (`synopsisStatus: "no-text-layer"`) dan **tidak bisa dicari** di dalam buku.
- 60 dari 147 PDF punya text layer → synopsis bisa di-draft otomatis
  (`synopsisStatus: "auto"`).
- Metadata PDF & nama file sering berantakan (prefix tag `{SB}`, `CamScanner`,
  ALL-CAPS). Pipeline membersihkan sebagian; sisanya perlu override manual.
  Lihat `.cache/report.json` → `lowConfidenceMetadata` (43 buku) &
  `missingSynopsis` (92 buku).
- 10 buku punya halaman **landscape** (spread 2 halaman) → **tidak dirotasi**,
  ditandai di `landscapePages`.

---

*Related: [[Pipeline & Hosting]], [[Components - Book]], [[Project Overview]]*
