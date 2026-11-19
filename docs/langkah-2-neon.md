# Langkah 2 · Neon, onboarding, dan impor katalog

Branch Neon `development` (`br-royal-star-b3t63m7u`) sudah memakai migration `0001` hingga `0003`. Branch produksi dan Worker live belum berubah. Satu akun sintetis dibuat untuk menguji login di development.

## Menjalankan aplikasi lokal

File `.env` lokal berisi konfigurasi development yang diabaikan Git. Skema nama variabel ada di [`.env.example`](../.env.example).

```powershell
rtk proxy node --env-file=.env node_modules/astro/bin/astro.mjs dev --background
```

Astro SSR menggunakan `@neondatabase/serverless` dan `DATABASE_URL` pooled. Role development `pojok_baca_app` boleh membaca kolom profil yang dibutuhkan dan menyimpan nama/kelas saat onboarding. Role ini tidak bisa mengubah role siswa atau membaca NISN. Untuk Cloudflare, isi binding secret runtime dengan URL pooled, URL Neon Auth, dan secret cookie milik environment tujuan. Simpan URL direct hanya pada lingkungan pemeliharaan database.

### Akses reader

- Halaman katalog dan statistik agregat tetap dapat diakses tamu. Halaman reader mengarahkan tamu ke `/login/`. Operasi statistik yang menulis data memerlukan sesi.
- Astro memverifikasi sesi terhadap Neon Auth lalu mencari `public.users.user_id`. Sesi valid tanpa nama dan kelas lengkap diarahkan ke `/onboarding/`. Permintaan statistik dari profil belum lengkap menerima `403 onboarding_required`.
- Form onboarding menggunakan identitas sesi untuk menyimpan profil dan kembali ke URL internal. Akun nonaktif ditolak. Login dan onboarding menolak POST lintas origin.
- Form masuk menggunakan email dan kata sandi akun yang sudah ada. Pendaftaran publik, NISN sebagai metode login, manajemen akun, dan laporan guru mengikuti pekerjaan berikutnya.

## Impor manifest

Perintah ini memeriksa sumber dan aset lokal tanpa menulis database:

```powershell
rtk npm run db:import-catalog
```

Untuk menerapkan impor di branch yang sudah dimigrasi, sediakan `DATABASE_URL_UNPOOLED` dan `PB_IMPORT_HOST` dalam environment pemeliharaan, lalu jalankan `rtk npm run db:import-catalog -- --apply`. Host harus identik dengan host direct dalam URL. Terapkan migration berurutan pada koneksi direct sebelum impor.

Importer melewati buku 18+, mempertahankan slug, dan memasukkan setiap buku beserta edisinya dalam satu transaksi. Slug yang sudah ada dilewati untuk menjaga ID, edisi, dan perubahan admin. Katalog pada branch development berisi **127 buku**, dengan **123 published** dan **4 draft EPUB gambar**. Ada **37.643** jangkar halaman WebP, **1.161** paragraf EPUB teks, dan **143.781** paragraf total termasuk teks alternatif PDF. Impor ulang melewati semua 127 entri, dengan ID buku/edisi dan jumlah konten tetap sama.

Untuk PDF lama, beberapa halaman logis dapat menunjuk ke satu `asset_key`. Koordinat crop disimpan per halaman. Statistik resmi nantinya harus menghitung paparan halaman logis melalui reader, tanpa memakai jumlah halaman pada strip sebagai bukti baca.

## Hasil pemeriksaan dan batas tahap

Lima tes Node, pemeriksaan TypeScript, dan build Cloudflare lulus. Pemeriksaan output tidak menemukan kredensial development di kode atau JSON bundle. Uji HTTP dengan Neon development mencakup katalog tamu, penolakan reader/statistik untuk tamu, login, redirect profil belum lengkap, penolakan statistik sebelum onboarding, penyimpanan profil, reader EPUB, dan logout.

Halaman katalog dan reader masih merender dari sumber lama sambil menunggu integrasi katalog dan aset terproteksi. Proteksi tahap ini berlaku untuk halaman reader dan endpoint statistik. Menghalangi URL langsung ke aset lama, proxy R2 privat, serta alur unggah adalah bagian Langkah 3. Laporan resmi dan desain baru mengikuti Langkah 4.
