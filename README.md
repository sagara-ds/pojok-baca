# Pojok Baca RPL

Minimalist, mobile-first web app for reading books. Built with [Astro](https://astro.build) (SSR), Tailwind CSS v4, and TypeScript strict.

**Live:** https://pojok-baca.asagara2223.workers.dev

Katalog diambil dari **`data/books.json`** (127 buku) yang dibangun otomatis oleh `pipeline/` dari folder Google Drive publik: halaman buku dirender jadi strip WebP, lengkap dengan cover, sinopsis, dan versi PDF untuk diunduh. Baca online tersedia di halaman reader `/books/<slug>/read/`, termasuk mode teks untuk buku yang punya lapisan teks asli.

> **Branch policy:** `main` is the default branch and stays clean — it holds no feature work directly.
> Every feature is developed on its own `feat/*` branch and reaches `main` through a pull request.

## 🚀 Getting Started

```bash
npm install
npm run dev -- --background # dev server http://localhost:4321 (adapter node)
npm run build          # build produksi (adapter cloudflare)
npm run deploy         # build + wrangler deploy
npm run preview        # cek hasil build lokal
```

Pipeline katalog (jarang dijalankan; katalog sudah ter-generate ke `data/`):

```bash
npm run pipe:list      # enumerasi folder Drive sumber
npm run pipe:all       # fetch → scan → render → manifest
npm run pipe:bundle    # strip 3 halaman + indeks untuk reader
npm run pipe:text      # ekstrak teks buku → public/data/text (mode baca teks)
npm run pipe:pdf       # salin PDF ≤25 MB ke public/dl
npm run pipe:verify    # validasi kelengkapan aset katalog
```

## 📁 Project Structure

```text
src/
├── components/
│   ├── book/       # BookCard, BookCover, CoverPlaceholder, SavedList, ReadButton
│   ├── layout/     # Header, Footer, SearchBox
│   ├── reader/     # Reader.astro (gambar), TextReader.astro (teks)
│   └── ui/         # Button, Card, Skeleton, ErrorState, LoadingSpinner
├── layouts/        # BaseLayout.astro (SEO, structured data, tema)
├── pages/
│   ├── admin/      # panel admin (login, statistik, unggah)
│   ├── api/        # search, stats, admin login/upload
│   ├── books/      # daftar, detail, dan [slug]/read (reader)
│   ├── bookmark/   # buku tersimpan (localStorage)
│   ├── riwayat/    # riwayat baca (localStorage)
│   ├── setting/    # tema, ukuran font, mode baca
│   └── index.astro # beranda
├── scripts/        # reader.ts, library.ts, settings.ts, bookmarks-ui.ts
├── server/         # auth.ts, stats.ts, catalog.ts (KV opsional)
├── services/       # books.ts (adapter manifest), curation.ts, api.ts, types.ts
└── styles/         # global.css (Tailwind v4 @theme)

pipeline/           # CLI katalog: Drive → scan → render → bundle → manifest
data/
├── books.json           # manifest katalog (dihasilkan pipeline)
├── books.override.json  # koreksi manual judul/penulis/sinopsis/kategori
└── links.private.json   # peta dlId → PDF (internal, jangan dihapus)

public/
├── sheets/<slug>/       # strip 3 halaman (dipakai reader)
├── data/pages/          # indeks posisi halaman di strip
├── covers/, dl/, _headers
```

## 📚 Data Katalog

Seluruh data berasal dari manifest hasil pipeline dan disajikan lewat `src/services/books.ts`:

| Fungsi | Sumber |
|--------|--------|
| `fetchBooks(params)` | `data/books.json` — list + filter + paginasi + sort |
| `fetchBook(slug)` | detail per slug |
| `fetchCategories()` | agregasi kategori dari manifest |

- Halaman buku: WebP 900 px `q78`, **tanpa watermark**, digabung 3 halaman per strip
- PDF download: `public/dl/<dlId>.pdf` dengan `Content-Disposition: attachment` (13 file > 25 MB tidak ikut karena batas file Cloudflare)
- Mode teks: 60 buku punya lapisan teks; 4 EPUB berbasis gambar tetap dibaca sebagai halaman gambar
- Kurationi katalog (buku 18+ & varian duplikat) ada di `src/services/curation.ts` — non-destruktif, hanya menyembunyikan dari tampilan publik

## 🔐 Admin & Statistik

Panel: `/admin` (login token). Fitur:

- Statistik kunjungan, mulai baca, selesai baca, disimpan, grafik 7 hari, serta daftar paling dibaca & paling disimpan
- Unggah PDF + metadata (tahap 1 manual, lanjut `pipe:scan` → `pipe:render` → `pipe:manifest`)
- Publik **tidak** melihat detail statistik; hanya jumlah "Dibaca X×" di kartu Populer

Binding produksi:

- `PB_STATS` (KV) — statistik persisten
- `PB_CATALOG` (KV) — antrean metadata unggahan
- `PB_BOOKS` (R2) — **belum dikonfigurasi**; tanpa R2, file PDF unggahan tidak dipersist
- `PB_ADMIN_TOKEN` — **belum diset**; login admin sengaja dinonaktifkan (503) sampai secret diisi

```bash
# wajib agar admin bisa login
npx wrangler secret put PB_ADMIN_TOKEN

# opsional: simpan PDF sumber unggahan
npx wrangler r2 bucket create pojok-baca-sources
# lalu aktifkan blok r2_buckets di wrangler.jsonc
```

## 📚 Dokumentasi

Dokumentasi lengkap ada di vault Obsidian `Pojok baca/`:

- Project Overview, Tech Stack, API Integration
- Components - UI / Components - Book
- Pipeline & Hosting (keputusan arsitektur & batas hosting)
- Development Workflow, Deployment, Quick Reference

Detail pipeline: [`pipeline/README.md`](pipeline/README.md).

## 🛡️ Keamanan

Header keamanan diatur di `public/_headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ketat. Watermark pipeline dinonaktifkan. URL aset statis bukan kontrol akses.

---

Dibangun berdua oleh tim RPL.
