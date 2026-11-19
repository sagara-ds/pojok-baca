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
- Aset reader disajikan dari storage privat melalui `/api/reader/asset/`; URL unduhan dan strip statis tidak dipublikasikan.
- Mode teks memakai paragraf Neon; 4 EPUB gambar tanpa konten tetap berstatus draft.
- Kurationi katalog (buku 18+ & varian duplikat) ada di `src/services/curation.ts` — non-destruktif, hanya menyembunyikan dari tampilan publik

## 🔐 Admin & Statistik

Panel `/admin/catalog/` memakai akun Neon dengan role admin atau super admin.
PDF dikonversi di browser dan halaman disimpan sebagai WebP di storage privat.
Edisi staging terbit setelah setiap halaman dikonfirmasi. Detail publik menampilkan
agregat klik, pembaca unik, dan pembaca terbaru yang namanya disamarkan.

Konfigurasi dan cara verifikasi ada di [catatan reader dan unggah admin](docs/langkah-3-bagian-3-4.md).

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
