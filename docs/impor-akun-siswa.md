# Login Username/NIS dan impor akun siswa

Login sekolah menerima Username atau NIS dan kata sandi. Neon Auth memverifikasi kata sandi dan mengelola sesi. NIS disimpan sebagai teks di kolom terpisah dari NISN lama.

## Siapkan branch Neon sebelum deploy

1. Cocokkan endpoint database dan Neon Auth Worker dengan branch Neon tujuan.
2. Terapkan migration yang belum terpasang secara urut, mulai dari `0009_student_login.sql`, `0010_initial_password_change.sql`, lalu `0011_admin_student_password_reset.sql`.
3. Terapkan kembali `db/grants/student_login_runtime.sql` dan `db/grants/teacher_runtime.sql` setelah ketiga migration tersedia.
4. Pastikan Super Admin yang akan mereset akun punya izin `user: set-password` di Neon Auth. Hak akses Super Admin Pojok Baca diperiksa terpisah.
5. Terbitkan Worker setelah pengelola Neon mengonfirmasi skema dan grant. Jalankan dry-run file impor sebelum memakai `--apply` pada branch produksi yang disetujui.

## Format dan perintah

1. Salin [template siswa](../data/template-siswa.xlsx) ke folder privat, misalnya `data/private-imports/`, lalu isi tab **Siswa**. Tab **Contoh** menunjukkan format. CSV memakai header yang sama dan menerima pemisah koma atau titik koma.
2. Isi **Nama Lengkap**, **Kelas**, **Username**, **NIS**, dan **Password**. Username berisi 3–40 karakter, diawali huruf atau angka, serta memuat setidaknya satu huruf. NIS berupa teks berisi digit. Kata sandi awal berisi 8–128 karakter dan harus disimpan sebagai teks. Nol di depan NIS dan spasi di tepi kata sandi dipertahankan.
3. Jalankan validasi, lalu tambahkan `--apply` untuk membuat akun di branch tujuan.

```powershell
rtk npm run db:import-students -- 'data/private-imports/siswa.xlsx'
rtk npm run db:import-students -- 'data/private-imports/siswa.xlsx' --apply
```

Perintah tanpa `--apply` hanya membaca file lokal. Untuk menjalankan `--apply`, buat `.env.import-students` yang diabaikan Git dengan pengaturan berikut.

```dotenv
DATABASE_URL_UNPOOLED=
NEON_AUTH_BASE_URL=
PB_IMPORT_HOST=
PB_IMPORT_ORIGIN=http://localhost:4321
```

Isi URL direct dan URL Neon Auth dari branch yang sama. `PB_IMPORT_HOST` berisi hostname URL direct. Gunakan origin aplikasi yang dipercaya oleh Neon Auth. Impor memakai pendaftaran kata sandi Neon Auth dan memerlukan konfigurasi yang mengizinkan pendaftaran tanpa verifikasi email. Jalankan impor dari lingkungan pemeliharaan yang bisa mengakses database direct. Simpan workbook berisi sandi di folder privat.

## Hasil dan pemulihan

- Pasangan Username/NIS yang sudah terdaftar dilewati. Kata sandi, role, dan status aktif akun lama dipertahankan. Benturan identitas berbeda menghentikan impor dan menampilkan nomor baris.
- Setiap baris berhasil disimpan sebagai profil aktif dengan role `user` dan penanda wajib ganti kata sandi. Jika proses terputus, jalankan ulang file yang sama dengan kata sandi awal yang sama. Reservasi email internal memungkinkan penyambungan ke akun Neon Auth yang sudah dibuat pada percobaan sebelumnya.
- Siswa masuk dengan Username atau NIS dan kata sandi awal. Setelah mengganti kata sandi, siswa diteruskan ke tujuan semula. Nama dan kelas sudah terisi dari impor.
- Untuk akun staf, operator database menghubungkan UUID akun Neon Auth ke profil aktif dengan username unik dan data nama serta kelas atau tim. NIS staf boleh kosong. Migration mengisi username profil lama dari bagian awal email jika valid dan unik, dengan cadangan berbasis UUID untuk benturan.

## Reset akun siswa

Di **Admin → Manajemen pengguna**, cari siswa dengan nama, kelas, username, atau NIS. Klik **Reset kata sandi** pada akun siswa aktif, lalu konfirmasi dan salin kata sandi sementara sebelum menutup dialog. Berikan kata sandi melalui saluran pribadi sekolah. Sesi aplikasi siswa yang terbit sebelum reset harus masuk kembali. Saat masuk, siswa wajib mengganti kata sandi sementara. Audit log mencatat tindakan dan akun tujuan tanpa menyimpan kata sandi.
