# Pojok Baca RPL

Minimalist, mobile-first web app for reading books. Built with [Astro](https://astro.build) (SSR), Tailwind CSS v4, and TypeScript strict.

Data source: katalog lokal di `src/services/mock-data.ts` (24 buku contoh + kategori + cover SVG yang digenerate lokal). **Tanpa API eksternal, tanpa permintaan jaringan** — antarmuka `src/services/api.ts` siap ditukar ke backend/data file lokal kamu sendiri nanti.

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
├── layouts/        # BaseLayout.astro (SEO, structured data)
├── pages/
│   ├── books/      # daftar buku + detail buku
│   └── index.astro
├── services/       # api.ts (antarmuka data lokal), mock-data.ts, types.ts
├── utils/          # helpers.ts
└── styles/         # global.css (Tailwind v4 @theme)
```

## 📚 Data Lokal

Seluruh data buku berasal dari `src/services/mock-data.ts` dan disajikan lewat `src/services/api.ts`:

| Fungsi | Sumber |
|--------|--------|
| `fetchBooks(params)` | `getMockBooks()` — list + paginasi + kategori |
| `fetchBook(slug)` | `getMockBook()` — detail per slug |
| `searchBooks(q)` | `searchMockBooks()` — pencarian lokal |
| `fetchCategories()` | `mockCategories` |

- Cover buku: SVG digenerate langsung (`data:` URL), bukan gambar dari internet
- `ApiError`-style fallback upstream tidak ada lagi — tidak ada upstream
- Rencana berikutnya: koleksi file buku lokal kamu sendiri (mis. `assets/books/`) + halaman reader

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

Header keamanan diatur di `public/_headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ketat.

---

Dibangun berdua oleh tim RPL.
