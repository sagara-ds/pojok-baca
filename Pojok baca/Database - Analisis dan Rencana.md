# Analisis project dan rencana database Pojok Baca

Tanggal pemeriksaan: 5 November 2026 (Asia/Jakarta).
Status: rancangan, belum diterapkan. Pemeriksaan Neon hanya membaca metadata; tidak ada tabel, akun, branch, atau konfigurasi cloud yang diubah.

## Kesimpulan

Empat tabel aplikasi yang diusulkan cukup untuk MVP: users, books, user_readings, dan reading_logs. Sesuaikan identitas dengan Neon Auth yang sudah aktif, tambahkan slug sebagai penghubung katalog, dan hubungkan log ke reading_id. Pertahankan aset buku di penyimpanan statis. Database menyimpan profil aplikasi, metadata buku, progres, dan aktivitas.

## Temuan project yang terverifikasi

| Area | Kondisi saat ini | Dampak ke integrasi |
| --- | --- | --- |
| Runtime | Astro SSR, TypeScript, Tailwind; adapter Node untuk development dan Cloudflare untuk produksi | Koneksi database dijalankan pada server/API Astro; jangan kirim kredensial ke browser |
| Dependensi | Belum ada driver Postgres, ORM, atau SDK autentikasi di package.json | Integrasi database dan login belum diimplementasikan |
| Katalog | src/services/books.ts:10 mengimpor data/books.json; API layanan masih memfilter array lokal | Pembuatan tabel saja tidak mengubah sumber data aplikasi |
| Identitas buku | Book.id saat ini sama dengan slug | Pertahankan slug walaupun database memakai book_id integer |
| Reader | src/services/books.ts:92 membaca jumlah halaman, ukuran gambar, mode aset, dan lokasi indeks dari manifest | Lima kolom books awal belum cukup untuk mengganti manifest sepenuhnya |
| Progres | src/scripts/reader.ts:40,63 menyimpan pb:pos:<slug> di localStorage | Data hanya berlaku pada browser tersebut; tidak terkait akun |
| Lanjut membaca | ReadButton.astro:55 juga membaca localStorage | Tombol ini perlu disinkronkan bersama reader |
| Login/otorisasi | Tidak ada route login/register atau API progres; middleware hanya memasang header keamanan | Perlu verifikasi identitas dan kepemilikan data di server |
| Sesi | astro.config.mjs:20 mengatur session: false | Ini konfigurasi Astro session, bukan bukti bahwa Neon Auth tidak dapat digunakan |
| Popularitas | src/services/api.ts:72 mengurutkan berdasarkan jumlah halaman | Belum mencerminkan jumlah pembaca; nanti dapat dihitung dari user_readings |

Inventaris aktual data/books.json: **131 buku**, terdiri dari **124 PDF** dan **7 EPUB**, dengan **38.589 halaman PDF**. Semua slug unik, semua judul terisi, semua entri menandai cover tersedia, dan enam entri memiliki penulis kosong. Keberadaan seluruh file aset belum diverifikasi ulang. Tujuh EPUB memiliki pages = 0; reader sekarang tidak menyediakan konfigurasi untuk buku tanpa jumlah halaman. README masih menyebut 140+ buku, sehingga jumlah dalam rencana impor harus mengikuti manifest aktual. File JSON memiliki UTF-8 BOM; importer perlu menghapus BOM sebelum JSON.parse.

## Kondisi Neon

- Project: pojok-baca (spring-fog-53036464).
- Branch default: production (br-solitary-block-b3rwflo3).
- Database: neondb.
- Ditemukan sembilan tabel bawaan dalam schema neon_auth; empat tabel aplikasi belum ada.
- Neon Auth sudah aktif dengan provider better_auth, tetapi belum terhubung ke aplikasi lokal.
- neon_auth.user.id bertipe UUID; name, email, createdAt, dan data sesi sudah dikelola sistem autentikasi.
- Pemeriksaan Data API mengembalikan not found; rancangan ini menggunakan API server Astro.
- [Buka project Neon](https://console.neon.tech/app/projects/spring-fog-53036464).

## Rancangan empat tabel aplikasi

Ini usulan penyesuaian, bukan perubahan skema yang sudah dijalankan. Asumsi MVP: satu ringkasan bacaan per pasangan pengguna-buku; pembacaan ulang sebagai siklus terpisah belum didukung.

### 1. users — profil dan izin aplikasi

| Kolom | Tipe / aturan |
| --- | --- |
| user_id | INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY |
| auth_user_id | UUID NOT NULL UNIQUE, FK ke neon_auth.user(id) |
| role | TEXT NOT NULL DEFAULT 'user', CHECK role IN ('admin', 'user') |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

user_id integer tetap dipertahankan sesuai rancangan awal. auth_user_id menghubungkannya dengan akun Neon. Nama dan email diambil dari identitas Neon Auth yang sudah terverifikasi; password tidak disalin ke users. Role di tabel aplikasi menjadi sumber izin admin aplikasi, hanya boleh diubah lewat operasi admin yang terlindungi. Profil dapat dibuat secara idempoten setelah sesi login diverifikasi; tidak perlu menambah trigger pada tabel yang dikelola Neon.

Jika tugas sekolah mensyaratkan nama/email/password ada secara fisik di users, pilih autentikasi mandiri sebagai rancangan alternatif sebelum migrasi dibuat. Pada alternatif itu, gunakan password_hash, email unik tanpa membedakan huruf besar/kecil, dan implementasikan manajemen sesi/reset password. Jangan menjalankan dua sumber password untuk akun yang sama.

### 2. books — metadata inti dan identitas katalog

| Kolom | Tipe / aturan |
| --- | --- |
| book_id | INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY |
| slug | TEXT NOT NULL UNIQUE; nilai diambil persis dari manifest |
| judul | TEXT NOT NULL, tidak boleh kosong |
| penulis | TEXT NOT NULL; importer memakai 'Tidak diketahui' bila kosong |
| jumlah_halaman | INTEGER NULL, CHECK jumlah_halaman > 0 bila terisi |
| cover_img | TEXT NULL; path/URL, bukan isi gambar |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Normalisasikan pages = 0 pada tujuh EPUB menjadi NULL (belum diketahui), bukan mengarang jumlah halaman. Buku tanpa jumlah halaman belum ikut pelacakan berbasis halaman. Persentase ditampilkan hanya ketika jumlah_halaman diketahui.

Untuk tahap pertama, manifest tetap mengelola sinopsis, kategori, tipe file, pageW/pageH, assetMode, indeks gambar, dan dlId. books menjadi katalog identitas untuk foreign key pelacakan; importer melakukan upsert berdasarkan slug tanpa mengganti book_id. Ini menambah database tanpa memutus reader yang sudah berjalan.

Jika kelak seluruh katalog dikelola admin melalui database, pindahkan metadata tersebut secara eksplisit (termasuk kategori majemuk) sebelum mengganti layanan katalog. Jangan membiarkan pipeline menimpa edit admin tanpa aturan sumber data yang jelas. PDF/WebP tetap berupa aset; tidak dimasukkan sebagai blob ke tabel books.

### 3. user_readings — ringkasan status dan posisi

| Kolom | Tipe / aturan |
| --- | --- |
| reading_id | INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY |
| user_id | INTEGER NOT NULL, FK users.user_id |
| book_id | INTEGER NOT NULL, FK books.book_id |
| status | TEXT NOT NULL DEFAULT 'membaca', CHECK IN ('membaca', 'selesai', 'dropped') |
| halaman_terakhir | INTEGER NOT NULL DEFAULT 0, CHECK >= 0 |
| tanggal_mulai | TIMESTAMPTZ NOT NULL DEFAULT now() |
| tanggal_selesai | TIMESTAMPTZ NULL |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Tambahkan UNIQUE(user_id, book_id). Nol berarti belum ada posisi; halaman nyata memakai nomor 1 sampai jumlah_halaman. Posisi terakhir boleh turun ketika pengguna kembali ke halaman sebelumnya. Angka ini merupakan penanda posisi, bukan bukti seluruh halaman sebelumnya telah dibaca.

Aturan: tanggal_selesai terisi hanya untuk status selesai dan tidak lebih awal dari tanggal_mulai. Membuka kembali bacaan menghapus tanggal_selesai jika status berubah menjadi membaca. Penandaan selesai sebaiknya eksplisit; melompat ke halaman terakhir tidak otomatis membuktikan selesai membaca.

Batas halaman_terakhir <= books.jumlah_halaman memerlukan validasi server dalam transaksi atau trigger; CHECK biasa tidak boleh mengandalkan data tabel lain. Pengubahan jumlah halaman buku juga harus mempertahankan validitas progres yang sudah ada. updated_at perlu diisi pada setiap UPDATE atau memakai trigger; DEFAULT now() hanya berlaku saat INSERT.

### 4. reading_logs — aktivitas membaca per sesi/hari

| Kolom | Tipe / aturan |
| --- | --- |
| log_id | INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY |
| reading_id | INTEGER NOT NULL, FK user_readings.reading_id |
| event_id | UUID NOT NULL UNIQUE, dibuat sekali untuk setiap kiriman aktivitas |
| halaman_dibaca | INTEGER NOT NULL, CHECK > 0 |
| tanggal_log | DATE NOT NULL; tanggal aktivitas dalam Asia/Jakarta |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

reading_id menggantikan penyimpanan ulang user_id dan book_id: keduanya didapat lewat JOIN user_readings sehingga tidak dapat saling bertentangan. event_id mencegah kiriman ulang jaringan menggandakan statistik. Jangan memberi UNIQUE pada tanggal_log karena beberapa sesi pada tanggal yang sama sah.

Pisahkan perubahan posisi dari pencatatan aktivitas. Membuka halaman 100 dari halaman 1 tidak boleh otomatis menambahkan 99 halaman. Rekomendasi MVP: jumlah halaman per sesi dicatat secara eksplisit dan divalidasi server. Pelacakan otomatis memerlukan definisi kapan halaman dianggap dibaca, aturan lompat halaman/baca ulang, serta penggabungan lintas tab. Jangan mengisi grafik historis dari localStorage karena yang tersedia hanya posisi dan waktu simpan terakhir.

Sesi yang melintasi tengah malam WIB dipecah menjadi dua log tanggal. Retry mempertahankan event_id yang sama. Timestamp disimpan sebagai TIMESTAMPTZ, sementara pengelompokan grafik memakai tanggal WIB, bukan tanggal default UTC server.

## Relasi, indeks, dan penghapusan

~~~mermaid
erDiagram
    NEON_AUTH_USER ||--o| USERS : identitas
    USERS ||--o{ USER_READINGS : memiliki
    BOOKS ||--o{ USER_READINGS : dibaca
    USER_READINGS ||--o{ READING_LOGS : aktivitas
~~~

Indeks awal: UNIQUE auth_user_id, UNIQUE books.slug, UNIQUE(user_id, book_id), user_readings(user_id, status, updated_at DESC), user_readings(book_id), dan reading_logs(reading_id, tanggal_log). Pertimbangkan indeks tanggal_log terpisah ketika laporan admin lintas pengguna memang dibutuhkan; jangan menambah indeks tanpa pola query.

Kebijakan awal: hapus akun secara eksplisit dapat menghapus profil, ringkasan, dan log melalui cascade. Penghapusan buku yang sudah dirujuk memakai RESTRICT agar riwayat tidak lenyap. Untuk penyembunyian buku di masa depan, gunakan status arsip. Jangan menghapus buku otomatis hanya karena hilang dari satu hasil pipeline.

## Rencana integrasi bertahap

1. Buat migrasi yang tercatat di repo, uji pada branch development Neon sebelum menerapkannya ke production.
2. Buat importer dari data/books.json: tangani BOM, validasi slug/halaman, normalisasi tujuh EPUB dan enam penulis kosong, lalu upsert tanpa mereset identitas buku.
3. Hubungkan Neon Auth ke login aplikasi dan verifikasi identitas di API server. Kredensial database hanya tersedia pada server; user_id tidak dipercaya dari body request.
4. Tambahkan API mulai/lanjut membaca, perubahan status/posisi, pencatatan aktivitas, dan statistik harian. Semua akses pengguna dibatasi berdasarkan identitas login; perubahan katalog memerlukan role admin.
5. Simpan log aktivitas dan pembaruan ringkasan terkait dalam transaksi. Tangani event_id duplikat serta pembaruan bersamaan dari beberapa tab/perangkat.
6. Hubungkan reader.ts dan ReadButton.astro. Pertahankan pengalaman tamu dengan localStorage; sinkronisasi posisi lama ke akun tidak boleh menimpa progres server atau menjadi histori aktivitas tanpa keputusan eksplisit.
7. Tambahkan grafik dengan tanggal kosong bernilai nol. Statistik harian menjumlahkan reading_logs.halaman_dibaca setelah JOIN ke bacaan milik pengguna.

Astro sudah mendukung route server, sehingga tidak perlu mengganti framework atau memindahkan aset buku untuk tahap ini. Driver/ORM ditentukan saat implementasi dengan memperhatikan runtime Node lokal dan Cloudflare produksi.

## Kriteria pengujian implementasi

- Impor 131 buku berhasil; pengulangan impor tidak membuat duplikat atau mengubah book_id.
- EPUB tanpa jumlah halaman tidak menyebabkan pembagian nol atau progres palsu.
- Login, logout, pemulihan sesi, dan akses tanpa login diuji; pengguna A tidak dapat membaca/mengubah data pengguna B.
- Pengguna biasa tidak dapat menjadikan dirinya admin atau mengubah katalog.
- Dua permintaan mulai membaca menghasilkan satu user_readings; retry aktivitas menghasilkan satu reading_logs.
- Halaman negatif/melebihi jumlah halaman ditolak; mundur atau lompat halaman tidak menambah statistik secara palsu.
- Kegagalan transaksi tidak meninggalkan ringkasan dan log yang berbeda; konflik dua perangkat ditangani.
- Tanggal sebelum/sesudah 00:00 WIB masuk hari yang tepat; status selesai dan tanggal selesai tetap konsisten.
- Katalog, pencarian, detail buku, aset reader, dan posisi tamu tetap berfungsi.

Pemeriksaan saat ini terbatas pada pembacaan sumber, analisis manifest, dan metadata Neon. Belum menjalankan build, pengujian aplikasi, migrasi SQL, atau integrasi login. Tidak ada kredensial yang ditambahkan ke repository.

## Referensi resmi

- [Neon Auth: identitas dan sesi di Postgres](https://neon.com/docs/auth/overview).
- [Neon: FK ke primary key identitas dan pemisahan profil aplikasi](https://neon.com/docs/data-api/database-advisor).
- [PostgreSQL identity columns](https://www.postgresql.org/docs/current/ddl-identity-columns.html).
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
- [Astro routing](https://docs.astro.build/en/guides/routing/).
