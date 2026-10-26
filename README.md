# Pojok Baca RPL

Minimalist, mobile-first web app for reading books. Built with [Astro](https://astro.build) (SSR), Tailwind CSS v4, and TypeScript strict.

Katalog diambil dari **`data/books.json`** (140+ buku) yang dibangun otomatis oleh `pipeline/` dari folder Google Drive publik: halaman buku dirender jadi strip WebP ber-watermark, lengkap dengan cover, sinopsis, dan versi PDF untuk diunduh. Baca online tersedia di halaman reader `/books/<slug>/read/`.

> **Branch policy:** `main` is the default branch and stays clean — it holds no feature work directly.
> Every feature is developed on its own `feat/*` branch and reaches `main` through a pull request.

## 🚀 Getting Started

```bash
npm install
npm run dev            # dev server http://localhost:4321 (adapter node)
npm run build          # build produksi (adapter cloudflare)
npm run deploy         # build + wrangler deploy
npm run preview        # cek hasil build lokal
```

Pipeline katalog (jarang dijalankan; katalog sudah ter-generate ke `data/`):

```bash
npm run pipe:list      # enumerasi folder Drive sumber
npm run pipe:all       # fetch → scan → render → manifest
npm run pipe:bundle    # strip 3 halaman + indeks untuk reader
npm run pipe:pdf       # salin PDF ≤25 MB ke public/dl
npm run pipe:verify    # validasi 140/140 aset lengkap
```

## 📁 Project Structure

```text
src/
├── components/
│   ├── book/       # BookCover, BookMeta, BookDescription, ReadButton
│   ├── layout/     # Header, Footer
│   ├── reader/     # Reader.astro (halaman baca penuh)
│   └── ui/         # Button, Card, Skeleton, ErrorState, LoadingSpinner
├── layouts/        # BaseLayout.astro (SEO, structured data)
├── pages/
│   ├── books/      # daftar, detail, dan [slug]/read (reader)
│   └── index.astro
├── scripts/        # reader.ts (logika client reader)
├── services/       # books.ts (adapter manifest), api.ts, types.ts
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

- Halaman buku: WebP 900 px `q78`, watermark tertanam di piksel, digabung 3 halaman per strip
- PDF download: `public/dl/<dlId>.pdf` dengan `Content-Disposition: attachment` (13 file > 25 MB tidak ikut karena batas file Cloudflare)
- Reader EPUB (7 buku) menyusul di M3

## 📚 Dokumentasi

Dokumentasi lengkap ada di vault Obsidian `Pojok baca/`:

- Project Overview, Tech Stack, API Integration
- Components - UI / Components - Book
- Pipeline & Hosting (keputusan arsitektur & batas hosting)
- Development Workflow, Deployment, Quick Reference

Detail pipeline: [`pipeline/README.md`](pipeline/README.md).

## 🛡️ Keamanan

Header keamanan diatur di `public/_headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ketat. Proteksi isi buku mengandalkan watermark tertanam, bukan obscurity URL.

---

Dibangun berdua oleh tim RPL.
