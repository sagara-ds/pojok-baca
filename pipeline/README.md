# Pipeline — Drive PDF → WebP → manifest

CLI mandiri (bukan bagian dari build Astro). Mengubah folder Google Drive publik
menjadi aset statis siap-deploy plus manifest `data/books.json`.

## Perintah

```bash
npm run pipe:list      # enumerasi isi folder Drive
npm run pipe:fetch     # unduh PDF/EPUB ke .cache/pdf/
npm run pipe:scan      # halaman, sha256, dHash, text layer, metadata, dedup
npm run pipe:render    # WebP + watermark ke .cache/pages & public/covers
npm run pipe:manifest  # data/books.json + data/links.private.json + laporan
npm run pipe:pdf       # salin PDF asli ke public/dl/<dlId>.pdf (nama acak)
npm run pipe:bundle    # gabung halaman jadi strip (host dengan limit file)
npm run pipe:all       # semua berurutan
```

Opsi:

| Opsi | Fungsi |
|---|---|
| `--limit N` | Batasi jumlah file (uji coba) |
| `--slug <slug>` | Hanya proses satu buku |
| `--concurrency N` | Jumlah proses paralel (default 5; render pakai 8) |
| `--pages N` | Halaman per strip (untuk `bundle`) |
| `--max-height N` | Tinggi maks strip (default 4096 px, aman untuk iOS Safari) |
| `--max-mb N` | Batas ukuran PDF saat menyalin ke `public/dl` (default 25) |
| `--resume` | Lewati halaman yang sudah ada (render ulang jadi jauh lebih cepat) |
| `--retry-failed` | Render ulang hanya buku yang gagal |
| `--only <regex>` | Batasi `scan` ke nama file yang cocok (mis. `epub`) |
| `--folder-id <id>` | Ganti folder Drive |

Semua langkah **idempotent**: file yang sudah ada dilewati, jadi aman diulang.

## Kenapa bukan `pdftoppm` + `cwebp`

Tool itu tidak ada di mesin ini dan butuh instalasi sistem terpisah di Windows.
Pipeline ini pakai:

| Tool | Peran | Alasan |
|---|---|---|
| `mupdf` (WASM) | render PDF → piksel | tanpa native dependency, cross-platform, JBIG2 didukung |
| `sharp` | resize + WebP + watermark | sharp **tidak bisa** membaca PDF (`sharp.format.pdf.input === false`), jadi hanya untuk gambar |
| `fflate` | baca EPUB (zip) | EPUB bukan PDF; isinya XHTML + gambar |

Terukur di mesin ini (24 halaman, single-thread):

| Jalur | Waktu | Ukuran |
|---|---|---|
| MuPDF PNG → sharp | 17,4 s | 86 KB/hal |
| **MuPDF raw → sharp** | **12,3 s** | 86 KB/hal |
| MuPDF raw → sharp, `effort: 2` | **8,2 s** | 88 KB/hal |

Pipeline pakai **piksel mentah** (bukan PNG) + `effort: 2` → **~53% lebih
cepat**, file hanya +2%. Diverifikasi: selisih piksel antara jalur PNG dan raw
= **0**.

> ** Jebakan:** kalau sempat pakai `pdf.js` (`pdf-to-img`), wajib set `wasmUrl` ke
> `pdfjs-dist/wasm/` (dengan trailing slash). Tanpa itu decoder JBIG2 gagal dan
> halaman teks keluar sebagai file 2 KB yang hampir kosong — **tanpa error**.
> `mupdf` tidak punya masalah ini.

## Output

```
.cache/                     cache kerja (tidak di-commit)
  drive.json     daftar file Drive
  pdf/<id>.pdf   PDF sumber
  pages/<slug>/  halaman WebP 900 px hasil render (sumber untuk bundle)
  scan.json      hasil per-file: halaman, sha256, dHash, text layer, metadata
  groups.json    kelompok duplikat + slug per buku
  render.json    hasil render per slug
  report.json    laporan diagnosa
public/                     hanya berisi aset yang benar-benar di-deploy
  sheets/<slug>/bNNN.webp   strip vertikal 3 halaman (dipakai reader)
  data/pages/<slug>.json    indeks posisi halaman di dalam strip (kuncinya kecil, di-commit)
  covers/<slug>.webp        cover 400 px
  dl/<dlId>.pdf             PDF asli (nama acak, Content-Disposition: attachment)
data/
  books.json             manifest publik (dipakai sisi Astro)
  books.override.json    override manual (judul/penulis/sinopsis/kategori)
  links.private.json     peta dlId → file PDF (server-side)
```

> **Kenapa `.cache/pages` bukan `public/pages`:** `astro build` menyalin seluruh
> `public/` ke `dist/` lalu mengunggahnya. 41.669 halaman tunggal + strip akan
> melampaui batas 20.000 file per Worker Cloudflare. Dengan meletakkan hasil
> render di cache, `public/` hanya berisi strip (16.461 file) + cover + PDF
> ≈ 16.900 file — di bawah batas.

## Stripping (`bundle`)

Satu strip vertikal berisi maksimal `--pages` halaman dengan tinggi total
maksimal `--max-height` px:

| Varian | Jumlah file | Status vs batas 20.000 |
|---|---|---|
| 2 halaman/strip | 20.855 | ✗ lewat |
| **3 halaman/strip** | **16.461** | ✓ +3.500 ruang |
| 4 halaman/strip | 16.441 | ✓ (sama saja — tinggi yang membatasi) |

Reader memotong strip dengan container `overflow: hidden` + offset Y — posisi
tiap halaman ada di `public/data/pages/<slug>.json` (~5 KB/buku):

```json
{ "slug": "135-hours", "mode": "sheets", "count": 228, "pageW": 900, "pageH": 1335,
  "strips": [ { "file": "b001.webp", "pages": [[0,1335],[1343,1335],[2686,1334]] } ] }
```

Catatan performa bundling:

- `sharp.metadata()` ~28 ms/file; parser header WebP custom ~3 ms/file — untuk
  41 k halaman itu 19 menit vs 2 menit. Parser membaca dimensi langsung dari
  header RIFF/VP8/VP8L/VP8X.
- Encoding WebP `effort: 2` ~0,6 s per strip; dengan `sharp.concurrency(2)` +
  6 worker paralel → ~320 strip/menit ( semua 16.461 strip ≈ 51 menit).
- `--mode images` juga ada: tidak menggabung apa pun (untuk host tanpa batas
  file, mis. saat memakai Netlify sambil eksperimen).

## Manifest

`data/books.json`:

```json
{
  "slug": "23-59",
  "type": "pdf",
  "pageW": 900,
  "pageH": 1335,
  "assetMode": "sheets",
  "title": "23:59",
  "author": "Brian Khrisna",
  "pages": 240,
  "cover": "/covers/23-59.webp",
  "pagePath": "/pages/23-59/{n}.webp",
  "dlId": "dl_x8Kq2mNp7R4t",
  "synopsis": "…",
  "synopsisStatus": "auto",
  "categories": [],
  "hasTextLayer": false,
  "landscapePages": [],
  "metaConfidence": "high"
}
```

`pageW`/`pageH`/`assetMode` diambil dari indeks reader `public/data/pages/<slug>.json`
(buku EPUB tidak punya indeks → kembali ke default `images` 900×1316; tidak
dipakai karena halaman read-nya memang tidak tersedia).

`metaConfidence`: `high` | `medium` | `low` | `manual`.
`low` → judul/penulis perlu diperiksa manual (lihat `data/books.override.json`).

`synopsisStatus`:
- `auto` — draft dari text layer
- `manual` — dari `books.override.json`
- `empty` — ada text layer tapi teksnya terlalu pendek
- `no-text-layer` — buku hasil scan, tidak ada teks sama sekali → perlu synopsis manual

## Pembersihan metadata

Nama file sumber rusak & tidak konsisten, jadi metadata melewati beberapa lapis:

| Lapis | Contoh | Hasil |
|---|---|---|
| Buang prefix `Salinan` | `Salinan Salinan X by Y.pdf` | `X by Y` |
| Buang jejak | `_Z_Library`, ` ( WeLib.org )`, ` - eBookWave`, ` tagt` | dibuang |
| Nomor seri | `1. Tere Liye - Negeri Para Bedebah` | `Tere Liye - Negeri Para Bedebah` |
| Penulis di belakang | `X by Y` | judul `X`, penulis `Y` |
| Penulis di depan | `Tere Liye - Hujan` | judul `Hujan`, penulis `Tere Liye` |
| Penulis dalam kurung | `... (Jack Canfield)` | penulis diambil dari kurung |
| Judul junk | `test`, `untitled`, `new doc`, `CamScanner ...` | dibuang, fallback ke nama file |
| Penulis alat | `convert-jpg-to-pdf.net`, `CamScanner` | dibuang |
| ALL-CAPS | `(UN)PERFECT MARRIAGE` | `(Un)Perfect Marriage` |
| Pola `X - Y` | `Tere Liye - Hujan` **atau** `Fluent English - Barbara R. Raifsnider` | diputuskan oleh metadata PDF |

Metadata PDF & hasil parse nama file lalu dibandingkan:
yang sama → pakai metadata (lebih presisi, mis. `23:59` vs `2359`);
metadata yang junk → pakai nama file.

Pola `X - Y` ambigu (bisa `Penulis - Judul` atau `Judul - Penulis`), jadi
kandidat dikumpulkan dulu lalu dicocokkan dengan metadata PDF: metadata judul
mengandung bagian kiri → kiri = judul; mengandung bagian kanan → kanan = judul.
Kalau metadata tidak memihak, bagian kiri dianggap penulis.

Sisa yang tidak bisa ditebak ada di `.cache/report.json` →
`lowConfidenceMetadata` (perlu override manual di `data/books.override.json`).

## Guard otomatis

1. **Halaman kosong** — 5 halaman pertama tiap buku dicek `std dev < 3`.
   Ini menangkap kasus decoder gambar gagal (halaman jadi putih).
2. **Duplikat** — tiga sinyal: sha256 identik, dHash cover identik + jumlah
   halaman sama, judul+penulis sama + jumlah halaman hampir sama.
   Yang dipakai = paling banyak halaman, lalu file terbesar. Sisanya dicatat
   di `.cache/report.json` (tidak dihapus).
3. **Halaman landscape** — ditandai di `landscapePages`, **tidak dirotasi**.
   Spread 2 halaman (terbukti di koleksi ini) akan rusak kalau diputar.

## Batas hosting (semua diverifikasi per dokumentasi resmi, 2026-10)

| | Jumlah file | Ukuran file | Request | Bandwidth | Kartu kredit? |
|---|---|---|---|---|---|
| **Cloudflare Workers free** | 20.000 | 25 MiB | static asset **gratis & tanpa batas** | gratis | **tidak** |
| Cloudflare Pages free | 20.000 | 25 MiB | gratis | gratis | tidak |
| **Netlify free** | **tanpa limit** (54.000/dir) | ~10 MB anjuran | — | 100 GB/bulan | **tidak** |
| Vercel Hobby | 15.000 file source | — | — | 100 GB/bulan | tidak |

Koleksi ini ≈ **39.000 halaman** → **melebihi limit 20.000 file** di Cloudflare.

Pilihan:
- **Netlify** → 1 file/halaman aman (tanpa limit jumlah file). Batasnya bandwidth 100 GB/bulan.
- **Cloudflare Workers** → perlu menggabung beberapa halaman per file agar < 20.000 file.
  Bandwidth & request static asset gratis tanpa batas, jadi ini paling murah untuk trafik tinggi.

Perintah `bundle` (bagian M2) menggabungkan halaman dari `public/pages/` yang
sudah jadi — tanpa render ulang dari PDF.

## Kenapa watermark dipasang saat pipeline

Tanpa object storage berbayar (R2 dll.), file aset harus dilayani sebagai
static asset → URL-nya bisa ditebak dan di-scrape. Yang **benar-benar** protects
adalah watermark yang tertanam di piksel: masih ada walau gambar di-screenshot
atau di-share ulang. Di luar itu, proteksi hanya "obscurity" (nama file opaque).

Watermark ada dua lapis:
1. Pola teks miring berulang — sudah ikut ter-render ke dalam `.webp`.
2. Corner mark berisi slug buku.

> Overlay per-sesi berbasis CSS (untuk traceability) bisa ditambahkan di sisi
> reader tanpa biaya server, tapi bisa dilepas lewat devtools.

## Download PDF tanpa R2

Berkas PDF asli diletakkan di `public/dl/<dlId>.pdf` dengan `dlId` acak
(12 karakter, bukan turunan slug) sehingga URL-nya tidak bisa ditebak dari
judul buku. Route `/dl/*` dipaksa `Content-Disposition: attachment` lewat
`public/_headers`.

`dlId` disimpan di `data/links.private.json` (tidak dikirim ke browser sebagai
peta path). Tombol download mengarah ke halaman safelink, yang setelah hitung
mundur mengarahkan ke `/dl/<dlId>.pdf`.

> **dlId harus stabil antar-run.** `pipe:manifest` menjaga dlId lama untuk slug
> yang sudah ada. File `links.private.json` disimpan berformat `dlId → {slug}`;
> fungsinya denormalisasi menerima format ini maupun format `slug → {dlId}`.
> Kalau file ini dihapus, semua dlId berubah **dan file lama di `public/dl/`
> jadi yatim** — jalankan ulang `pipe:pdf` setelah itu. Skrip `pipe:pdf`
> menyalin ulang sesuai pelemapsan yang aktif, jadi penyelamatan yang benar
> selalu: pulihkan `links.private.json` → `pipe:manifest` → `pipe:pdf`.

Keterbatasan yang harus jujur: tanpa server yang memegang berkas, ini
**obscurity, bukan keamanan**. Yang bisa: URL tidak tertebak, ada
countdown & peringatan, dan PDF bisa diberi watermark (tidak diimplementasikan
di M1).

## Catatan legal

Nama file sumber memuat artefak `Z_Library` dan `WeLib.org` → koleksi ini
berasal dari pemb’outilan buku komersial. Hosting di domain sendiri berarti
menanggung risiko infringement (terminasi akun, DMCA, paparan billing).
