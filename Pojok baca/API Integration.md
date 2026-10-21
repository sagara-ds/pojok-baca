# API Integration - Open Library

> **Riwayat:** integrasi pertama memakai welib.org (Anna's Archive lineage), dihapus pada
> `feat/openlibrary-integration` karena Cloudflare memblokir akses server-side
> (HTTP 403 terverifikasi 21 Okt 2026). Bagian bawah dokumen disiapkan untuk Google Books.

## 📡 API Overview (Open Library — sumber aktif)
**Base URL:** `https://openlibrary.org`
**Auth:** Tidak perlu API key (publik, gratis)
**Rate limit:** Self-imposed 60 req/menit per IP via proxy (`src/utils/rate-limit.ts`)
**Etiquette:** kirim User-Agent identitas + `fields=` agar payload ringan

## 🔗 Endpoint Terpakai (semua terverifikasi live)
| Endpoint | Method | Params | Response |
|----------|--------|--------|----------|
| `/search.json` | GET | `q`, `language`, `limit` (≤100), `offset`, `sort`, `fields` | `{ numFound, docs[] }` |
| `/works/{id}.json` | GET | - | `{ title, description, subjects[] }` |
| `covers.openlibrary.org/b/id/{cover_i}-L.jpg` | GET | - | gambar JPEG |

### Query solr — aturan yang HARUS dipatuhi (dulu biar nggak kejadian observasi 0-hasil)
| Kasus | Bentuk query | Hasil tes live |
|-------|--------------|----------------|
| Browse tanpa kata kunci, dua bahasa | `q=language:(ind eng)` | ✅ 1.887 karya |
| Browse satu bahasa | `q=language:ind` | ✅ 137.041 karya |
| Pencarian + filter bahasa | `q=laskar pelangi` + param `language=ind` (boleh diulang) | ✅ 6 hasil |
| Pencarian + kategori | `q=<teks> AND subject:fiction` | ✅ |
| `q` kosong / `q=*` | - | ❌ 0 hasil / error (min 3 karakter) |
| `language=ind,eng` (koma) | - | ❌ 0 hasil (bug upstream) |
| `q=language:ind OR language:eng` | - | ❌ 0 hasil |

Kode bahasa: MARC `ind` = Indonesia, `eng` = English — dipetakan bolak-balik ke app `id`/`en` di `openlibrary.ts`.

Mapping kategori (`mockCategories` slug → subject facet): `pemrograman → computer programming`, `fiksi → fiction`, `sejarah → history`, dst. — tabel `categoryToSubject` di `src/services/openlibrary.ts`.

## 📦 TypeScript Types (`src/services/types.ts`)
```typescript
interface Book extends MockSource {
  id: string;              // "OL15302003W" (work key)
  slug: string;            // sama dengan id
  title: string;
  author: string;          // join maks 3 author_name; kosong -> "Tidak diketahui"
  coverUrl: string;        // covers.openlibrary.org; kosong -> placeholder SVG UI
  description: string;     // string kosong di list, diisi di detail
  category: string;        // subject[0]
  publishedYear: number;   // first_publish_year
  pages: number;           // number_of_pages_median
  language: string;        // "id" | "en" | kode MARC lain (passthrough)
  isbn?: string;           // utamakan 13 digit
  readingUrl?: string;     // https://openlibrary.org/works/{id}
  isMock?: boolean;        // true bila dari fallback mock
}

interface BookListResponse extends MockSource {
  data: Book[];
  pagination: { page, limit, total, totalPages };  // total = numFound
}
```

## 🔄 Data Flow
```
Client (Browser)
    ↓
Astro Page (SSR)  /  UI filter bahasa (?language=id|en)
    ↓
services/api.ts  (sanitizeBook, mock fallback, isMock flag)
    ↓
services/openlibrary.ts  (query builder solr, mapping, timeout+retry)
    ↓
Open Library  /search.json + /works/{id}.json + covers
    ↓
Render
```

## 🧪 Testing API (perhatikan trailing slash — `trailingSlash: 'always'`)
```bash
# Daftar default (Indonesia + Inggris)
curl "http://localhost:4322/api/proxy/books/?limit=5"
# Filter bahasa
curl "http://localhost:4322/api/proxy/books/?language=id&sort=rating"
# Pencarian Indonesia
curl "http://localhost:4322/api/proxy/books/?q=laskar+pelangi&language=id"
# Pencarian Inggris
curl "http://localhost:4322/api/proxy/books/?q=harry+potter&language=en"
# Detail (work key OL)
curl "http://localhost:4322/api/proxy/books/OL15302003W/"
# Kategori (mock)
curl "http://localhost:4322/api/proxy/categories/"
# Halaman SSR
curl "http://localhost:4322/books/?language=id"
```
Tanda data asli vs mock: header `X-Mock-Data: true` hanya muncul saat fallback.

## ⚠️ Error Handling
- Timeout: 10 detik (AbortSignal), retry 3x utk 5xx (backoff 1s) — di `openlibrary.ts` & `api.ts`
- Slug bukan pola `OL\d+W` (mis. slug mock lama) → dilayani mock data
- Work description gagal → detail tetap tampil tanpa description
- Results sort `new` mengandung noise data OL (judul kacau / tag bahasa salah) — kualitas upstream

## 🚀 Google Books (opsional, dormant)
`src/services/googlebooks.ts` siap dipakai bila `GOOGLE_BOOKS_API_KEY` diset di `.env`
(see `.env.example`). Bonus: kuota anonymous tanpa key = 0/hari (selalu 429), wajib key.
Pakai `volumes?q=<query>&langRestrict=id|en`; cocok untuk melengkapi katalog Indonesia
dan enrich description di halaman detail via ISBN match.
Referensi API resmi Indonesia yang **bukan** discovery publik: SAKEDAP Perpusnas
(`api-penerbitsakedap.perpusnas.go.id`, khusus akun penerbit), endpoint lama
`isbn.perpusnas.go.id/Account/GetBuku` sudah 404.

---
*Related: [[Tech Stack]], [[Components - Book]], [[Project Overview]]*
