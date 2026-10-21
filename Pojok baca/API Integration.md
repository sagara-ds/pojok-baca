# API Integration — Data Lokal (Mock)

> **Riwayat:** pernah mencoba welib.org (Anna's Archive lineage) — Cloudflare memblokir
> akses server-side (HTTP 403). Sempat integrasi Open Library & skeleton Google Books
> di `feat/openlibrary-integration`, lalu **semuanya dihapus** di `feat/data-lokal`
> karena keputusan proyek: **tanpa API dari web manapun, pembangunan koleksi lokal**.

## 📡 Sumber Data
**Tunggal & lokal:** `src/services/mock-data.ts`
- 24 buku contoh (semua `language: 'id'`)
- 19 kategori (`mockCategories`)
- Cover: SVG digenerate runtime lewat `generateCover()` → `data:` URL — **nol permintaan gambar ke internet**
- `readingUrl` mengarah ke route internal `/books/{slug}/read`

## 🧩 Antarmuka (`src/services/api.ts`)
| Fungsi | Delegasi ke | Dipakai |
|--------|-------------|---------|
| `fetchBooks(params: SearchParams)` | `getMockBooks()` | `pages/books/index.astro` |
| `fetchBook(slug)` | `getMockBook()` | `pages/books/[slug].astro` |
| `searchBooks(query, params)` | `searchMockBooks()` | (belum terpakai — siap untuk fitur pencarian) |
| `fetchCategories()` | `mockCategories` | (belum terpakai — siap untuk filter kategori) |
| `sanitizeHtml(text)` / `sanitizeText(text)` | utility lokal | `BookDescription`, `BookMeta`, `[slug]` |

Desain: antarmuka sengaja dipertahankan supaya kelak menunik ke sumber data baru
(koleksi file buku milik sendiri) cukup dengan mengganti isi implementasi — pages tidak berubah.

## 🔮 Rencana Berikutnya (koleksi buku sendiri)
1. Simpan file buku lokal (mis. `assets/books/*.pdf`) — note: pastikan hak distribusinya benar bila app akan dipublikasi
2. Halaman reader `/books/{slug}/read` yang serve file dari aset lokal
3. Pencarian & filter kategori dipasang ke UI (antarmuka sudah siap)

## ⚠️ Yang Sudah Dihapus (riwayat)
- `id.welib.org` proxy + fallback mock (`HTTP 403` dari Cloudflare)
- Open Library search/works/covers client
- Google Books dormant client + `.env.example`
- API proxy routes (`/api/proxy/*`) + rate limiter utils

---
*Related: [[Tech Stack]], [[Components - Book]], [[Project Overview]]*
