# Penyimpanan privat di GitHub

Worker `pojok-baca` memakai `STORAGE_DRIVER=github` dan membaca aset dari cabang `main` di `sagara-ds/pojok-baca-assets`. Konfigurasi Cloudflare tidak memuat binding R2. Beri Worker fine-grained token yang hanya punya akses ke repo aset dengan izin `Contents: Read and write`.

Masukkan pengaturan `STORAGE_DRIVER`, `GITHUB_STORAGE_OWNER`, `GITHUB_STORAGE_REPO`, `GITHUB_STORAGE_BRANCH`, dan `GITHUB_STORAGE_TOKEN` sebagai secret Worker bersama pengaturan Neon produksi. Gunakan URL Neon pooled untuk role runtime `pojok_baca_app`. URL direct milik pemilik database khusus pemeliharaan.

## Migrasi strip lama

```powershell
rtk npm run storage:stage-legacy
rtk npm run storage:migrate-github
rtk npm run storage:migrate-github -- --apply
```

Perintah kedua memeriksa semua key `book_pages.asset_key` yang akan diimpor ke Neon. Perintah ketiga memakai kredensial Git lokal, memverifikasi bahwa tujuan adalah repo privat yang ditetapkan, melewati key yang sudah tercatat, lalu membuat commit dan push bertahap. Jalankan ulang perintah ketiga bila transfer terputus. Checkout migrasi ada di `.cache/github-assets`.

## Upload, baca, dan cleanup

Browser admin mengonversi PDF menjadi WebP dengan antrean dua halaman. PUT ke Worker melakukan penulisan terautentikasi melalui GitHub Contents API. Pembaca menerima stream WebP melalui gatekeeper setelah sesi dan edisi diperiksa. Cache internal berbagi objek antar-request yang sudah lolos pemeriksaan. Header ke browser tetap `private`.

Cleanup GitHub menghapus maksimal delapan file per permintaan dan bisa dilanjutkan dari halaman katalog admin. Penghapusan membersihkan cabang `main`. Objek yang sudah tercatat dalam commit lama tetap ada dalam riwayat repo privat. Volume baca dan tulis juga mengikuti batas API GitHub. [Batas API GitHub](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

## Rilis produksi

GitHub Storage mulai melayani trafik produksi pada versi Cloudflare `179100f7-9693-4fd5-a3e2-a01306965501`. Neon produksi berisi 127 buku dan referensi untuk 14.773 strip yang sudah ada di repo privat. Preview versi Worker dinonaktifkan agar URL versi lama tidak dapat menyajikan strip publik. Uji produksi lulus untuk katalog, login Neon Auth, onboarding, proteksi akses langsung, pembacaan WebP, serta konversi PDF, unggah, verifikasi, dan cleanup dari browser admin.
