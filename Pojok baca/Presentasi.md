---
marp: true
theme: default
paginate: true
---

<!--
Presentasi: Pojok Baca RPL
Kompatibel Marp (npx @marp-team/marp-cli Presentasi.md -o slides.html / --pptx)
Fakta: dikumpulkan dari vault (Pojok baca/*.md) + kondisi repo per 2026-10-29.
-->

# 📚 Pojok Baca RPL
### Perpustakaan Digital Minimalis — Baca Langsung di Browser

**Sagara D.S & Arbi Alviano** · Tim RPL
🌐 https://pojok-baca.asagara2223.workers.dev

---

## 🎯 Apa ini?

Website perpustakaan digital **mobile-first** untuk membaca koleksi novel Indonesia:

- **Daftar & cari buku** → grid cover, pagination, typeahead search
- **Detail buku** → sinopsis, metadata, tombol lanjut baca
- **Reader khusus** → baca langsung di browser, tanpa perlu unduh
- **~140 buku** — Tere Liye, Erich Fromm, Keigo Higashino, dll.

> Minimalis, cepat, aman, dan gratis di-hosting.

---

## 🔢 Proyek dalam Angka

| Metrik | Angka |
|---|---|
| Buku (hasil dedup dari 154 file) | **140** |
| Sumber file | 147 PDF + 7 EPUB |
| Total halaman | **41.669** |
| Strip WebP (3 halaman/strip) | 16.461 |
| Total file di-deploy | **≈ 16.900** (batas gratis: 20.000) |
| Sedang baca 1 buku penuh | ± 29 MB → **104 request** (vs 313) |

---

## 🌱 Cerita Sumber Data

- Awal: scrape **welib.org** (Anna's Archive) → ❌ Cloudflare blokir (HTTP 403)
- Uji Open Library & Google Books → dihapus juga
- **Keputusan: tanpa API dari web — bangun koleksi lokal sendiri**

```
Folder Google Drive 154 file
   → pipeline 8 langkah (list → fetch → scan → render
     → manifest → pdf → bundle → verify)
   → data/books.json + public/ (sheets, covers, dl)
```

---

## 🏗️ Arsitektur Big Picture

```
Google Drive (PDF/EPUB)
      │  pipe:fetch, pipe:scan, pipe:render (+ watermark)
      ▼
┌─────────────────────────────────────┐
│ data/books.json      (manifest)     │
│ public/sheets/*.webp (strip 3 hlm)  │
│ public/covers/*.webp (cover w/ wm)  │
│ public/dl/*.pdf      (unduh asli)   │
└──────────────┬──────────────────────┘
      │  Astro 7 (SSR) + Tailwind v4
      ▼
Cloudflare Workers  →  pojok-baca.workers.dev
```

---

## 🧰 Tech Stack

| Layer | Pilihan | Kenapa |
|---|---|---|
| Framework | **Astro 7.4** | Static-first + SSR per halaman detail |
| Styling | **Tailwind CSS v4** | Config CSS-first (`@theme`), zero-config |
| Language | **TypeScript strict** | `noUncheckedIndexedAccess` aktif |
| Komponen | **Pure Astro** | Tanpa React/Vue/Svelte → JS minimal |
| Hosting | **Cloudflare Workers** | Static asset gratis & tanpa batas |
| Deploy | **wrangler** | `npm run deploy` dari lokal |

---

## 🖥️ Aplikasi Web (M1–M2)

**Daftar buku** `/books/`
- Grid 2/4/5 kolom responsif, pagination, **skeleton loading**
- Search typeahead dengan debounce 300 ms + highlight hasil

**Detail buku** `/books/<slug>/`
- SSR, structured data JSON-LD (`schema.org/Book`)
- Metadata semantik `<dl>`, sinopsis "read more/less"

**Reader** `/books/<slug>/read/`
- Paged per halaman — swipe / keyboard / klik
- **"Lanjutkan Baca"** — posisi tersimpan di `localStorage`
- Mode gelap: inversi scan (`invert + hue-rotate`)

---

## 🧩 Kenapa "Strip 3 Halaman"?

Batas Cloudflare free: **20.000 file / Worker version**

| Varian | File hasil | Lolos? |
|---|---|---|
| 1 halaman/file | ~42.000 | ✗ |
| 2 halaman/strip | 20.855 | ✗ |
| **3 halaman/strip** | **16.461** | ✓ + sisa untuk cover & app |

- Reader memotong strip di client (`overflow: hidden` + offset)
- Bonus kinerja: 104 request/buku vs 313 → terasa cepat di mobile
- Posisi tiap halaman: `data/pages/<slug>.json` (~5 KB/buku)

---

## 🔒 Keamanan: Watermark, bukan Sembunyi

Konsekuensi tanpa R2 (privat bucket): URL aset bisa diketahui publik
→ proteksi URL hanyalah *obscurity*.

Yang benar-benar melindungi buku:
1. **Watermark tertanam di piksel** hasil render (tidak bisa dihapus via URL)
2. Sanitizer teks (`sanitizeHtml`/`sanitizeText`) di layer API
3. Security headers via middleware (CSP, nosniff, dll.)
4. Unduhan PDF: nama acak `dl/<dlId>.pdf`, max **25 MB** (batasan Cloudflare)
5. PDF > 25 MB otomatis dilewati — katalog tetap valid

---

## 🎨 Desain: Buttermilk × Midnight Blue

```
#FFF2BA (buttermilk)  ←→  #0F3C65 (midnight blue)
     Kontras pasangan tetap: 9.9 : 1
```

Dark mode otomatis (`prefers-color-scheme`) — dua warna bertukar
tinta ↔ kertas, kontras **identik** di kedua mode.

**Cover placeholder desain**: kalau cover 404, tampil "sampul"
tipografis (blok midnight + tipografi buttermilk) — tidak pernah
ada kotak abu kosong / ikon rusak.

---

## ♿ Accessibility (WCAG 2.1 AA)

- Semantic HTML: `<main>`, `<header>`, `<dl>`, `<article>`, `<nav>`
- Skip link ke `#main-content`
- Focus visible 2 px di semua elemen interaktif
- ARIA label untuk tombol icon-only, `aria-live` di reader
- Keyboard penuh: ←/→/Home/End/Space/Esc di reader
- `prefers-reduced-motion` menonaktifkan animasi

---

## ☁️ Keputusan Hosting (jalan berat!)

| Platform | Batas | Risiko biaya? | Kartu? |
|---|---|---|---|
| Netlify free | 100 GB/bln → ± 3.500 baca buku | ✓ ditagih saat traffic ramai | tidak |
| Vercel Hobby | 100 GB/bln | ✓ | tidak |
| **Cloudflare Workers free** | static request **gratis tanpa batas** | ✗ | **tidak** |

→ **Cloudflare satu-satunya** opsi yang tidak mungkin kena tagihan,
walau R2 sebenarnya lebih rapi — sayangnya butuh kartu kredit.

---

## ⚙️ Build & Deploy

```bash
npm run pipe:all     # render + bundle + manifest (idempotent)
npm run deploy       # astro build && wrangler deploy
```

- Build Astro ~2 menit; upload wrangler ~2 menit
- Aset besar (`sheets/`, `covers/`, `dl/`) **di-gitignore**
  → deploy dari mesin lokal, tidak lewat git
- Verifikasi: smoke test SSR + klas klas CSS via curl
- Rollback: versi Worker sebelumnya tinggal re-deploy

---

## 🐛 Lesson Learned (War Stories)

1. **Vite bermasalah memindai `public/` ribuan file** pada `astro dev`
   → ignore `sheets/`, `covers/`, `dl/` di Vite watcher
2. **BOM UTF-8 ditolak deploy** Cloudflare → headers dibersihkan
3. **Margin auto pada grid item menonaktifkan stretch** — cover bisa
   0×0 px dan "hilang" di breakpoint tertentu → wajib lebar eksplisit
   atau `mx-0`
4. **Literal `${...}` di atribut Astro tidak di-interpolate** — styling bar
   sort & pagination rusak diam-diam
5. dlId harus stabil — `links.private.json` jangan pernah dihapus

---

## 🗺️ Roadmap (M3)

- [ ] Reader EPUB (7 buku unedited Tere Liye belum bisa dibaca in-browser)
- [ ] Filter berbasis URL & halaman kategori
- [ ] Lengkapi metadata manual (43 buku `lowConfidenceMetadata`,
      92 sinopsis kosong) via `books.override.json`
- [ ] CI/CD GitHub Actions (check + lint + build otomatis)
- [ ] Domain custom + audit Lighthouse ≥ 90 semua kategori

---

## 🌐 Demo

🌐 **https://pojok-baca.asagara2223.workers.dev**

1. `/books/` — teluri 140 buku, coba search "Tere Liye"
2. Buka detail buku → **Lanjutkan Baca** (posisi proses tersimpan)
3. Reader: geser halaman, coba mode gelap, tutup & buka — posisi tetap

### Terima kasih 🙏

*Repo: `pojok-baca` — Astro 7 + Tailwind 4 + TypeScript strict*
*Vault dokumentasi: Obsidian `Pojok baca/` (10 note)*
