# Langkah 4 · Warm Editorial dan laporan guru

Spesifikasi visual ada di [DESIGN.md](../DESIGN.md). Migration `0007` dan `0008` serta grant terkait terpasang di Neon development dan produksi. Worker `pojok-baca` memakai [GitHub Storage privat](deploy-github-storage.md) di produksi.

## Pengalaman siswa dan tamu

- Eksplorasi memakai palet krem, hijau hutan, sampul asli, dan font lokal. Jumlah koleksi, pembaca aktif hari ini, dan rak berasal dari database. Filter kategori dan format berlaku pada ketiga rak.
- Detail utama ada di `/book/[slug]/`. URL detail lama mengarah ke sana. Tombol baca memakai posisi yang tersimpan di akun, sedangkan daftar pembaca menampilkan nama tersamarkan. Tab kutipan hanya berisi kutipan publik yang telah disetujui.
- Reader memberi pilihan tema Putih, Sepia, dan Gelap serta ukuran teks. Ketuk area bacaan untuk menampilkan atau menyembunyikan kontrol. Escape dan fokus keyboard mengembalikan kontrol. Aturan sesi, waktu halaman, dan debounce tetap berlaku.
- `/my-library/` menampilkan riwayat, buku favorit, jangkar Favorit, dan kutipan milik akun login. Jangkar edisi arsip tetap tampak tanpa link baca. `/riwayat/` dan `/bookmark/` mengarah ke tab Neon. Simpanan browser dari versi lama tidak diimpor sebagai data akun.

## Akses pengelola

| Kemampuan | Admin | Super Admin |
| --- | --- | --- |
| Ringkasan, katalog, upload, dan rekomendasi | Ya | Ya |
| Moderasi kutipan dan komentar | Ya | Ya |
| Laporan guru dengan nama asli dan cetak | Ya | Ya |
| Ekspor CSV resmi | — | Ya |
| Role, status akun, dan audit log | — | Ya |

Laporan dan grafik memakai fakta yang sama. Sesi dan halaman dikelompokkan berdasarkan tanggal Asia/Jakarta. Satu judul dihitung sekali per siswa dalam rentang. Halaman yang sama hanya dihitung sekali per hari WIB, dan dapat dihitung lagi saat benar-benar dibaca pada hari lain. Siswa dalam kelas terpilih tanpa aktivitas tetap mendapat baris bernilai nol. Sesi yang dicatat sebagai aktivitas staf tetap dikecualikan walaupun pengguna diturunkan menjadi siswa kemudian. Untuk data sebelum migration `0007`, role pada waktu aktivitas tidak tersedia sehingga kolom riwayat role diisi dari role pengguna saat migration.

Mutasi pengelolaan dicatat bersama perubahan dalam transaksi PostgreSQL. Perubahan role dan status memakai lock bersama, memeriksa ulang role pelaku, dan menolak pengurangan Super Admin efektif terakhir. Tampilan audit hanya mengambil metadata yang diizinkan. Role runtime tidak menerima akses tulis kolom role atau akses baca langsung ke fakta laporan.

Untuk membuka panel pada database yang belum punya Super Admin, siapkan satu akun Neon tepercaya yang profilnya sudah lengkap dan jadikan Super Admin melalui koneksi pemeliharaan. Profil dan aktivitas sintetis Langkah 4 dibersihkan setelah pengujian. Hak Super Admin pengguna produksi belum diubah.

## Pengujian

- 12 unit test, TypeScript, `astro check`, dan build Cloudflare lulus. Grant `pojok_baca_app` membatasi mutasi role dan akses laporan ke fungsi yang menjalankan pemeriksaan otorisasi.
- Uji HTTP Worker dengan Neon development mencakup keempat tingkat akses, privasi identitas, CSV di batas tengah malam WIB, audit mutasi, dan penguncian Super Admin terakhir. Uji Chrome pada layar 1366 dan 390 piksel mencakup navigasi siswa, kontrol reader, dan gaya cetak laporan.
- Regresi reader memverifikasi sesi 15 detik, hitung halaman setelah 4 detik, dan aset privat. Regresi upload memverifikasi konversi PDF, retry, penggantian edisi, dan cleanup. Worker produksi memakai [GitHub Storage privat](deploy-github-storage.md) dengan dua unggahan paralel dari browser.
