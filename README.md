# Pojok Baca RPL

Minimalist, mobile-first web app for reading books. Built with [Astro](https://astro.build) (SSR), Tailwind CSS v4, and TypeScript strict.

Data source: [Open Library](https://openlibrary.org/developers/api) (katalog publik Internet Archive) — pencarian + metadata + cover, gratis tanpa API key. Client-nya ditulis sendiri di `src/services/openlibrary.ts` (lihat bagian **API Client**). Filter bahasa bawaan: `ind` (Indonesia) dan `eng` (Inggris).

> Riwayat: sebelumnya memakai welib.org (Anna's Archive lineage). Sumber itu dihapus karena Cloudflare memblokir akses server-side (HTTP 403) — lihat `feat/openlibrary-integration`.

## 📐 Branch Strategy

`main` stays as the default branch and holds no feature work directly. Every feature lives on its own `feat/*` branch and lands in `main` through a pull request.

```bash
# Start a new feature from an up-to-date main
git checkout main && git pull
git checkout -b feat/nama-fitur

# Commit and push
git add -A && git commit -m "feat(scope): deskripsi singkat"
git push origin feat/nama-fitur
```

## 🚀 Getting Started

```bash
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # production build (SSR, @astrojs/node)
npm run preview    # serve the production build locally
```

## 📁 Project Structure

```text
src/
├── components/
│   ├── book/       # BookCover, BookMeta, BookDescription, ReadButton
│   ├── layout/     # Header, Footer
│   └── ui/         # Button, Card, Skeleton, ErrorState, LoadingSpinner
├── layouts/        # BaseLayout.astro (SEO, CSP, structured data)
├── pages/
│   ├── api/proxy/  # proxy rate-limited (list, search, detail, categories)
│   ├── books/      # daftar buku + detail buku + filter bahasa
│   └── index.astro
├── services/       # api.ts (service utama + sanitasi), openlibrary.ts (client),
│                   # googlebooks.ts (opsional), mock-data.ts, types.ts
├── utils/          # helpers.ts, rate-limit.ts
└── styles/         # global.css (Tailwind v4 @theme)
```

## 🔌 API Client

Diaplikasi ini client API ditulis sendiri (tanpa wrapper npm) supaya sanitasi
dan mapping ke tipe `Book` sepenuhnya terkontrol:

| File | Sumber | Status |
|------|--------|--------|
| `src/services/openlibrary.ts` | Open Library Search/Works/Covers | **aktif** |
| `src/services/googlebooks.ts` | Google Books API (`langRestrict=id\|en`) | dormant — aktif bila `GOOGLE_BOOKS_API_KEY` diset di `.env` |
| `src/services/mock-data.ts` | 24 buku contoh + kategori | fallback + kategori UI |

Alternatif wrapper npm (hasil riset, belum dipakai): [`open-library-client`](https://www.npmjs.com/package/open-library-client) (TS wrapper Open Library), [`@googleapis/books`](https://www.npmjs.com/package/@googleapis/books) (client resmi Google), [`google-books-search`](https://www.npmjs.com/package/google-books-search).

## 🔧 API Proxy

Semua permintaan upstream lewat service layer + proxy server-side, supaya respons bisa disanitasi dan rate limit bisa diterapkan.

| Route | Keterangan |
|-------|------------|
| `GET /api/proxy/books/` | Daftar buku + paginasi + filter `?language=id\|en` |
| `GET /api/proxy/books/OL15302003W` | Detail buku (work key Open Library) |
| `GET /api/proxy/books/?q=...` | Pencarian |
| `GET /api/proxy/categories/` | Daftar kategori (mock, dipakai sebagai subject facet) |

- Rate limit: 60 request/menit per IP (`src/utils/rate-limit.ts`)
- Sanitasi HTML/teks sebelum dikirim ke client
- Fallback ke `src/services/mock-data.ts` bila upstream gagal, dengan header `X-Mock-Data: true`
- Cache: detail 1 jam, list 5 menit, kategori 1 hari

## 📚 Dokumentasi

Dokumentasi lengkap ada di vault Obsidian `Pojok baca/`:

- Project Overview
- Tech Stack
- API Integration
- Components - UI / Components - Book
- Development Workflow
- Deployment
- Quick Reference

## 🛡️ Keamanan

Header keamanan diatur di `public/_headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ketat, plus CSP di `BaseLayout.astro`.

---

Dibangun berdua oleh tim RPL.
