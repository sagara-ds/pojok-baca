# Langkah 3 · Reader privat dan unggah edisi

Migration `0005_private_reader.sql` dan `0006_admin_editions.sql` beserta grant runtime sudah diterapkan di Neon `development`. Database produksi dan Worker live belum diubah.

## Reader dan pencatatan

- `/read/[slug]/` membuka edisi aktif dari Neon dan membuat sesi untuk profil terverifikasi. URL lama tetap mengarahkan ke reader yang sama. Mode gambar memakai halaman logis, termasuk crop untuk strip lama. Mode teks memakai paragraf berindeks mulai dari nol.
- `/api/reader/asset/` memeriksa profil dan otorisasi edisi sebelum membaca objek. Edisi staging hanya bisa dipratinjau admin. WebP dikirim dengan `Cache-Control: private, max-age=300` dan `Vary: Cookie`. Jalur aset publik lama tetap ditutup.
- Browser hanya meminta grup aset untuk halaman aktif dan maksimal dua halaman berikutnya. Strip yang sama memakai satu permintaan. Sesi dikonfirmasi setelah konten tampil dan tab terlihat 15 detik. Halaman terhitung setelah 4 detik tampil aktif dan sesi dikonfirmasi. Waktu mulai dan ambang minimum diperiksa ulang di Postgres. Refresh dalam cooldown 30 menit tidak menghasilkan sesi agregat baru.
- Pembaruan paragraf memakai Intersection Observer dan debounce 3 detik. Database mengurutkan penulisan progres berdasarkan sesi dan nomor urut kiriman. Reader mendukung favorit buku, halaman atau paragraf, serta kutipan privat dari teks yang diekstrak, seleksi dalam satu paragraf, atau input manual untuk WebP tanpa teks.
- Role aplikasi hanya menjalankan fungsi yang diperlukan. `reader_action` memanggil `confirm_read_session` di dalam transaksi. Akses tulis langsung ke `book_views`, `reading_page_reads`, dan `admin_audit_logs` tidak diberikan.

## Unggah admin

Masuk lewat Neon dengan profil lengkap dan role `admin` atau `super_admin`. Buka `/admin/catalog/upload/` untuk buku baru, atau pilih **Unggah edisi** pada judul yang sudah ada. Login token bersama sudah dipensiunkan di kode ini.

PDF.js mengonversi halaman di browser menjadi WebP lebar maksimal 1100 px, kualitas 0,78. Batas PDF 100 MB dan 5.000 halaman. Antrean maksimal empat pekerjaan. Kemajuan bertambah saat server mengonfirmasi objek WebP, dan setiap halaman gagal memiliki tombol retry. Unggahan terputus bisa dilanjutkan dengan memilih PDF yang sama, diverifikasi lewat hash SHA-256.

Storage S3/R2 memakai presigned PUT berdurasi 60 detik yang hanya dapat membuat satu objek WebP. Konfigurasi CORS bucket harus mengizinkan asal aplikasi, metode PUT, dan header `Content-Type`, `Cache-Control`, serta `If-None-Match`. Adapter lokal dan binding R2 native memakai PUT terautentikasi untuk pengembangan atau runtime yang sudah memiliki binding. PDF sumber tetap diproses di browser.

Saat penerbitan, transaksi mengambil `pg_try_advisory_xact_lock`, memeriksa halaman 1 sampai N, menukar pointer edisi, dan menulis audit. Edisi lama masuk `cleanup_pending`. Penghapusan batch dijalankan sesudah commit, setelah izin unggah lama kedaluwarsa bila masih aktif. Katalog admin menyediakan aksi retry cleanup. Halaman dari edisi lama tidak lagi dapat dibaca lewat gatekeeper, sementara jangkar historisnya tetap tersimpan.

## Konfigurasi dan verifikasi

- Dev Node memakai storage lokal. Jalankan `rtk npm run storage:stage-legacy` sekali untuk menyediakan strip lama, lalu jalankan Astro dengan `--background` dan konfigurasi Neon development.
- Worker membutuhkan Neon runtime secrets dan storage privat. Untuk S3/R2 lihat `.env.example`. Jika memakai binding native, set `STORAGE_DRIVER=r2` dan tambahkan binding `PB_PRIVATE_FILES` ke bucket privat. Migrasikan strip lama dengan key yang sama seperti `book_pages.asset_key` sebelum rilis.
- Uji Worker lokal memakai Miniflare, bucket R2 emulasi, dan Neon development. Tanggal kompatibilitas emulator adalah 19 Oktober 2026, batas biner lokal. Konfigurasi Worker tetap 22 Oktober 2026.
- `npm test` lulus 10 tes, bersama TypeScript dan build Cloudflare. Pemeriksaan bundle tidak menemukan kredensial development atau aset buku privat di keluaran publik.
- Uji HTTP mencakup penolakan tamu dan profil belum lengkap, WebP privat, ambang 4 dan 15 detik, replay/cooldown, penolakan progres lama, favorit, dan kutipan privat. Uji admin mencakup penolakan token lama, izin preview draft, penolakan finalisasi tanpa halaman, serta konflik lock dari koneksi kedua.
- Chrome headless merender PDF sintetis lima halaman. Uji memaksa satu PUT gagal, mengulang halaman itu, dan mengamati paling banyak empat PUT bersamaan. Teks terekstrak, WebP berukuran lebar 1100 px, edisi lama dipertahankan selama izin unggah aktif, lalu objeknya terhapus tanpa menghapus edisi baru.
- Presign S3 diuji tanpa bucket produksi. Saat deployment berikutnya, konfigurasi bucket dan CORS harus diverifikasi di environment tujuan.
