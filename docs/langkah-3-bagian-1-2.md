# Langkah 3 · Penyimpanan privat dan katalog Neon

Bagian 1 dan 2 memakai branch Neon `development`. Migration `0004_public_catalog_activity.sql` menambahkan statistik publik dan query pembaca terbaru. Jalankan juga `db/grants/catalog_runtime.sql` setelah role runtime dibuat. Grant memberi akses ke kolom view yang diperlukan dan fungsi terbatas tanpa membuka tabel event mentah.

Beranda, katalog, pencarian, dan detail memakai `current_book_catalog`. URL `/book/[slug]/` mengarah ke detail yang sama dengan URL lama `/books/[slug]/`. Hanya edisi aktif yang terbit tampil di katalog publik, dengan kurasi 18+ dan varian tersembunyi tetap berlaku. Daftar `/admin/catalog/` meminta sesi Neon dan role admin atau super admin untuk menampilkan draft.

Klik detail dicatat dari identitas sesi siswa dengan profil lengkap. Statistik mengikuti cooldown yang sudah ada. Daftar publik menampilkan maksimal lima siswa aktif yang mengizinkan visibilitas, dengan nama melalui `maskName()`, kelas, dan waktu relatif.

## Aset dan konfigurasi storage

Astro membentuk direktori statis dari daftar izin berisi sampul dan berkas pendukung situs. Pipeline masih bisa membaca sumber hasil render di `public/`. Strip gambar, indeks halaman, teks, dan unduhan dikecualikan dari paket publik. Server Vite juga menolak jalur sumber dan lokasi penyimpanan privat.

Jalankan `rtk npm run storage:stage-legacy` untuk menyalin strip lama ke `.data/private-storage/sheets/` tanpa menimpa salinan yang sudah ada. Storage lokal adalah default dev. Storage S3/R2 memakai kontrak yang sama dan bisa dipilih lewat `STORAGE_DRIVER=s3` serta konfigurasi pada [`.env.example`](../.env.example). Gunakan bucket privat dan kredensial dengan akses terbatas ke bucket itu. Tidak ada bucket R2 produksi yang dibuat atau diuji pada bagian ini.

Gatekeeper dan reader baru mengikuti bagian 3. Selama transisi ini, renderer lama yang mengandalkan URL aset statis tidak bisa menampilkan isi buku. Upload browser dan penghentian alur admin token lama mengikuti bagian 4. Situs produksi belum diubah.

## Verifikasi

- Delapan tes Node, TypeScript, dan build Cloudflare lulus. Pemeriksaan paket memastikan sampul masuk `dist/client`, sedangkan isi buku, unduhan, dan kredensial development tidak masuk bundle.
- Uji HTTP paket Worker dengan Miniflare dan Neon development memeriksa 121 judul publik, pencarian sinopsis, empat draft khusus admin, CTA login, dan penolakan jalur aset lama. Akun sintetis memverifikasi cooldown klik, masking, serta opt-out.
- Uji HTTP memakai runtime lokal dengan tanggal kompatibilitas 19 Oktober 2026, batas yang didukung biner yang terpasang. Konfigurasi Worker tetap 22 Oktober 2026. Peluncur Astro dev mengalami timeout di mesin ini, sehingga verifikasi HTTP dijalankan pada paket Worker.
