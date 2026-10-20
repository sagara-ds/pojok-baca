# Pojok Baca RPL

Minimalist, mobile-first web app for reading books. Built with [Astro](https://astro.build) (SSR), Tailwind CSS v4, and TypeScript strict.

Data source: [welib.org](https://id.welib.org/) (Anna's Archive lineage), accessed through a server-side API proxy.

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
│   ├── api/proxy/  # server-side proxy ke welib.org
│   ├── books/      # daftar buku + detail buku
│   └── index.astro
├── services/       # api.ts (client + sanitasi), mock-data.ts, types.ts
└── styles/         # global.css (Tailwind v4 @theme)
```

## 🔌 API Proxy

Semua permintaan ke welib.org lewat proxy server-side, supaya API key tidak bocor dan respons bisa disanitasi.

| Route | Keterangan |
|-------|------------|
| `GET /api/proxy/books/` | Daftar buku + paginasi |
| `GET /api/proxy/books/:slug` | Detail buku |
| `GET /api/proxy/books/?q=...` | Pencarian |
| `GET /api/proxy/categories/` | Daftar kategori |

- Rate limit: 60 request/menit per IP
- Sanitasi HTML/teks sebelum dikirim ke client
- Fallback ke `src/services/mock-data.ts` bila upstream tidak dapat diakses (Cloudflare 403), dengan header `X-Mock-Data: true`

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
