# Pipeline — Drive PDF → WebP → manifest

CLI mandiri (bukan bagian dari build Astro). Mengubah folder Google Drive publik
menjadi aset statis siap-deploy plus manifest `data/books.json`.

## Perintah

```bash
npm run pipe:list      # enumerasi isi folder Drive
npm run pipe:fetch     # unduh PDF/EPUB ke .cache/pdf/
npm run pipe:scan      # halaman, sha256, dHash, text layer, metadata, dedup
npm run pipe:render    # WebP + watermark ke public/pages & public/covers
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
.cache/
  drive.json     daftar file Drive
  pdf/<id>.pdf   PDF sumber (cache kerja, tidak di-commit)
  scan.json      hasil per-file: halaman, sha256, dHash, text layer, metadata
  groups.json    kelompok duplikat + slug per buku
  render.json    hasil render per slug
  report.json    laporan diagnosa
public/
  pages/<slug>/001.webp   halaman demi halaman, 900 px, sudah ber-watermark
  covers/<slug>.webp      cover 400 px
data/
  books.json             manifest publik (dipakai sisi Astro)
  books.override.json    override manual (judul/penulis/sinopsis/kategori)
  links.private.json     peta dlId → file PDF (server-side)
```

## Manifest

`data/books.json`:

```json
{
  "slug": "23-59",
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

`metaConfidence`: `high` | `medium` | `low` | `manual`.
`low` → judul/penulis perlu diperiksa manual (lihat `data/books.override.json`).

`synopsisStatus`:
- `auto` — draft dari text layer
- `manual` — dari `books.override.json`
- `empty` — ada text layer tapi teksnya terlalu pendek
- `no-text-layer` — buku hasil scan, tidak ada teks sama sekali → perlu synopsis manual

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

Keterbatasan yang harus jujur: tanpa server yang memegang berkas, ini
**obscurity, bukan keamanan**. Yang bisa: URL tidak tertebak, ada
countdown & peringatan, dan PDF bisa diberi watermark (tidak diimplementasikan
di M1).

## Catatan legal

Nama file sumber memuat artefak `Z_Library` dan `WeLib.org` → koleksi ini
berasal dari pemb’outilan buku komersial. Hosting di domain sendiri berarti
menanggung risiko infringement (terminasi akun, DMCA, paparan billing).
