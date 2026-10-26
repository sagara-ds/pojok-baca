# Pipeline & Hosting — Pojok Baca

> Keputusan 2026-10-21: **tanpa Cloudflare R2** (butuh kartu pembayaran).
> Semua aset/library dilayani sebagai **static asset**.
> Keputusan 2026-10-22 (M2): **Cloudflare Workers + strip 3 halaman** — lihat
> [Keputusan hosting](#keputusan-hosting-m2).

## Kenapa berubah

R2 memang pilihan paling rapi (bucket privat + binding Worker, request static
gratis tanpa batas), tapi aktivasi R2 **wajib** memakai payment method. Tanpa
kartu, opsi yang tersisa adalah static asset di hosting gratis.

Konsekuensi: URL aset **tidak bisa disembunyikan** → proteksi file berubah dari
"security" jadi "obscurity". Yang benar-benar proteksi adalah **watermark yang
tertanam di piksel** (hasil render), bukan URL.

## Batas hosting (dokumentasi resmi, diverifikasi 2026-10-21)

| | Jumlah file | Ukuran file | Request | Bandwidth | Kartu kredit? |
|---|---|---|---|---|---|
| Cloudflare Workers free | 20.000 | 25 MiB | static asset **gratis & tanpa batas** | gratis | **tidak** |
| Cloudflare Pages free | 20.000 | 25 MiB | gratis | gratis | tidak |
| **Netlify free** | **tanpa limit** (54.000/dir) | ~10 MB anjuran | — | 100 GB/bulan | **tidak** |
| Vercel Hobby | 15.000 file source | — | — | 100 GB/bulan | tidak |

## Keputusan hosting (M2)

Koleksi PDF = 41.669 halaman. Angka kunci:

- **Bandwidth**: rata-rata 28,9 MB per baca 1 buku penuh (313 request). Cap
  Netlify 100 GB/bln ≈ **3.500 baca buku/bln** (~115/hari) — habis kalau
  situs ramai, dan biayanya melewati batas = **ditarik kredit**.
- **Cloudflare**: request & bandwidth static asset **gratis tanpa batas** →
  satu-satunya pilihan tanpa risiko biaya.

Tapi Cloudflare membatasi 20.000 file per Worker version. Hasil `pipe:bundle`
dengan strip 3 halaman:

| Varian | Jumlah file | Status |
|---|---|---|
| 2 halaman/strip | 20.855 | ✗ lewat |
| **3 halaman/strip** | **16.461** | ✓ (sisanya untuk app, cover, PDF) |
| 4 halaman/strip | 16.441 | ✓ (tidak lebih aman — tinggi 4096 px yang membatasi) |

Reader memotong strip di client (container `overflow: hidden` + offset Y) —
posisi tiap halaman ada di `public/data/pages/<slug>.json` (~5 KB/buku).
Trade-off: browser decode strip utuh 900×3964 px (±14 MB RAM per strip);
reader melepas strip lama setelah pindah, jadi hanya 1–2 strip hidup.

Plus: 3 halaman per request membuat baca 1 buku = **104 request** vs 313
(request per halaman) — terasa lebih cepat di koneksi mobile.

## Arsitektur hasil render

```
.cache/                          cache kerja (tidak di-commit, tidak di-deploy)
  pages/<slug>/001.webp          halaman tunggal 900 px q78, BER-WATERMARK
  pdf/<id>.pdf                   PDF sumber
public/                          hanya aset yang benar-benar di-deploy (~16,9 ribu file)
  sheets/<slug>/bNNN.webp        strip vertikal 3 halaman (dipakai reader)
  data/pages/<slug>.json         indeks posisi halaman di strip (kuncinya kecil, di-commit)
  covers/<slug>.webp             cover 400 px, ber-watermark
  dl/<dlId>.pdf                  PDF asli (nama acak, max 25 MB)
data/
  books.json                     manifest publik (pageW/pageH/assetMode dari bundle)
  books.override.json            override manual
  links.private.json             peta dlId → file (server-side)
```

> Hasil render halaman tunggal sengaja **tidak** ditaruh di `public/`: build
> Astro menyalin seluruh `public/` ke `dist/`, jadi 41.669 file + strip akan
> melampaui batas 20.000 file per Worker. `.cache/pages` cuma jadi bahan baku
> `pipe:bundle`.

Halaman **tidak dirotasi** otomatis: di koleksi ini ada spread 2 halaman
(landscape) yang akan rusak kalau diputar. Ditandai di `landscapePages`
(reader memusatkan halaman landscape di viewport).

## Reader (M2)

- `/books/<slug>/read/` — halaman penuh, **paged** (bukan scroll): 1 halaman
  per layar, swipe/keyboard/klik, jump-to-page, progress bar.
- Sumber gambar: `sheets` (strip). Indeks penuh diambil client dari
  `/data/pages/<slug>.json` supaya bundle Worker tetap kecil (SSR hanya
  mengirim slug + count + pageW/pageH + mode).
- "Lanjutkan Baca" → `localStorage['pb:pos:<slug>'] = { page, at }`, disimpan
  debounce 600 ms; tombol di detail tampil lanjut dari halaman terakhir.
- Mode gelap: halaman scan di-inversi (`filter: invert(1) hue-rotate(180deg)`)
  supaya tidak menyilaukan; tema tersimpan sendiri (`pb:theme`).
- A11y: `aria-live` untuk counter, navigasi keyboard penuh (←/→/Space/Home/
  End/Esc), `prefers-reduced-motion` menonaktifkan transisi.

## PDF vs EPUB

Folder Drive berisi **147 PDF + 7 EPUB** (versi *unedited* Tere Liye).

- **PDF** → strip WebP via `pipe:bundle`. Mayoritas **tanpa text layer**
  (hasil scan) → tidak bisa dicari, synopsis harus manual.
- **EPUB** → **belum punya reader** (M3). Butuh pipeline ekstrak XHTML + gambar
  terpisah; saat ini 7 buku ini hanya tampil di daftar/detail, tombol baca
  mengarah kembali ke detail.

## Perintah

```bash
npm run pipe:list      # enumerasi Drive
npm run pipe:fetch     # unduh PDF/EPUB (retry + backoff, resume)
npm run pipe:scan      # halaman, sha256, dHash, text layer, dedup, slug
npm run pipe:render    # WebP + watermark → .cache/pages + public/covers
npm run pipe:manifest  # books.json + links.private.json + laporan
npm run pipe:pdf       # salin PDF asli ke public/dl/<dlId>.pdf
npm run pipe:bundle    # gabung halaman jadi strip + indeks reader
npm run pipe:all       # semua

npm run deploy         # astro build && wrangler deploy
npm run deploy:check   # astro build && wrangler deploy --dry-run
```

Detail teknis & jebakan: `pipeline/README.md`.

## ⚠️ `astro dev` timeout kalau public/ berisi ribuan file

Gejalanya:

```
Failed to create the dev server app: transport invoke timed out after 60000ms
(virtual:astro:server-app)
```

Penyebab: Vite memindai `public/` saat dev server start. Event loop jadi penuh
sehingga transport timeout.

**Fix** (sudah dipakai di `astro.config.mjs`):

```js
vite: {
  server: {
    watch: {
      ignored: ['**/public/sheets/**', '**/public/covers/**', '**/public/dl/**'],
    },
  },
}
```

Kalau tetap timeout: hapus cache `node_modules/.vite` + `.astro`, lalu jalankan
ulang. Jangan memindahkan folder aset keluar project hanya untuk development —
watcher ignore sudah cukup.

## Cara deploy

Sekarang target-nya Cloudflare Workers (adapter `@astrojs/cloudflare` +
`wrangler.jsonc`):

```bash
npm run pipe:all        # render + bundle + manifest + pdf (idempotent)
npm run deploy          # astro build && wrangler deploy
```

- `public/sheets` & `public/covers` & `public/dl` **di-gitignore** — deploy
  dari mesin lokal lewat `wrangler` (upload langsung, tidak lewat git).
- Angka akhir yang diunggah: strip 16.461 + indeks 133 + cover 140 + PDF 127
  + app = **≈ 16.900 file**, di bawah batas 20.000.
- 13 PDF > 25 MB otomatis dilewati (batas ukuran file Cloudflare & Netlify
  nggak sama — Cloudflare punya batas 25 MiB per file static asset).

## dlId harus stabil

`pipe:manifest` menjaga dlId lama (file `links.private.json` dipertahankan).
**Jangan hapus file itu** — kalau hilang, semua dlId regenerasi dan file PDF
lama di `public/dl/` jadi yatim. Skrip pemulihan: pulihkan file → `pipe:manifest`
→ `pipe:pdf` (menyalin ulang sesuai pelemapsan aktif).

---

*Related: [[API Integration]], [[Components - Book]], [[Tech Stack]]*
