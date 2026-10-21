# Pipeline & Hosting (M1) — Pojok Baca

> Keputusan 2026-10-21: **tanpa Cloudflare R2** (butuh kartu pembayaran).
> Semua aset/library dilayani sebagai **static asset**.

## Kenapa berubah

R2 memang pilihan paling rapi (bucket privat + binding Worker, request static
gratis tanpa batas), tapi aktivasi R2 **wajib** memakai payment method. Tanpa
kartu, opsi yang tersisa adalah static asset di hosting gratis.

Konsekuensi: URL aset **tidak bisa disembunyikan** → proteksi file berubah dari
"security" jadi "obscurity". Yang benar-benarproteksi adalah **watermark yang
tertanam di piksel** (hasil render), bukan URL.

## Batas hosting (dokumentasi resmi, diverifikasi 2026-10-21)

| | Jumlah file | Ukuran file | Request | Bandwidth | Kartu kredit? |
|---|---|---|---|---|---|
| Cloudflare Workers free | 20.000 | 25 MiB | static asset **gratis & tanpa batas** | gratis | **tidak** |
| Cloudflare Pages free | 20.000 | 25 MiB | gratis | gratis | tidak |
| **Netlify free** | **tanpa limit** (54.000/dir) | ~10 MB anjuran | — | 100 GB/bulan | **tidak** |
| Vercel Hobby | 15.000 file source | — | — | 100 GB/bulan | tidak |

Koleksi ini ≈ **39.000+ halaman** (147 PDF + 7 EPUB) → **melebihi 20.000 file**.

Pilihan:
- **Netlify** → 1 file/halaman aman. Batas: 100 GB/bulan bandwidth.
- **Cloudflare Workers** → perlu `bundle` (gabung N halaman per file) agar
  < 20.000 file. Bandwidth & request static asset gratis tanpa batas.
  → paling murah kalau trafik tinggi.

## Arsitektur hasil render

```
public/
  pages/<slug>/001.webp   halaman demi halaman, 900 px, q78, BER-WATERMARK
  covers/<slug>.webp      cover 400 px, ber-watermark
  dl/<dlId>.pdf           PDF asli (opsional, nama acak)
data/
  books.json              manifest publik
  books.override.json     override manual
  links.private.json      peta dlId → file (server-side)
```

Halaman **tidak dirotasi** otomatis: di koleksi ini ada spread 2 halaman
(landscape) yang akan rusak kalau diputar. Ditandai di `landscapePages`.

## PDF vs EPUB

Folder Drive berisi **147 PDF + 7 EPUB** (versi *unedited* Tere Liye).

- **PDF** → dirender jadi WebP (gambar). Mayoritas **tanpa text layer** (hasil
  scan) → tidak bisa dicari, synopsis harus manual.
- **EPUB** → punya teks asli; **tidak** dirender jadi gambar. Reader
  menyajikan XHTML-nya sebagai teks (jauh lebih kecil & bisa dicari).
  Ukurannya besar (33–128 MB) karena berisi gambar scan.

## Perintah

```bash
npm run pipe:list      # enumerasi Drive
npm run pipe:fetch     # unduh PDF/EPUB (retry + backoff, resume)
npm run pipe:scan      # halaman, sha256, dHash, text layer, dedup, slug
npm run pipe:render    # WebP + watermark
npm run pipe:manifest  # books.json + laporan
npm run pipe:pdf       # salin PDF asli ke public/dl/<dlId>.pdf
npm run pipe:bundle    # gabung halaman jadi strip
npm run pipe:all       # semua
```

Detail teknis & jebakan: `pipeline/README.md`.

## Cara deploy aset besar

`public/pages` (41.669 file, ±3,5 GB) **di-gitignore** — jangan di-commit.
Opsi deploy:

| Cara | Catatan |
|---|---|
| `netlify deploy` dari mesin lokal | ✅ paling praktis. Aset ter-upload langsung, tidak lewat git. Build dulu `npm run build` → `dist/` berisi aset. |
| Git deploy | Aset harus di-commit (3,5 GB) atau pipeline dijalankan di CI. Build minutes Netlify free = 300/bln. |
| Cloudflare Workers | Butuh `pipe:bundle` dulu supaya jumlah file < 20.000. Bandwidth & request static gratis. |

Catatan: `npm run build` menyalin `public/` ke `dist/` (±3,5 GB) → butuh disk &
waktu. Kalau itu terlalu berat, pakai Astro `output: 'static'` + deploy
`public/` langsung.

---

*Related: [[API Integration]], [[Components - Book]], [[Tech Stack]]*
