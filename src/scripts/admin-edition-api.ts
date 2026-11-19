const messages: Record<string, string> = {
  staging_exists: 'Draf memakai PDF yang berbeda. Pilih PDF yang sama, atau batalkan draf dari katalog.',
  slug_taken: 'Judul ini sudah dipakai. Gunakan aksi unggah edisi pada buku yang sudah ada.',
  invalid_book: 'Cek kembali judul, penulis, kategori, dan jumlah halaman PDF.',
  edition_busy: 'Edisi sedang diproses. Coba terbitkan lagi.',
  incomplete_edition: 'Masih ada halaman yang belum dikonfirmasi.',
  edition_not_staging: 'Draf ini sudah ditutup. Muat ulang katalog admin.',
  missing_webp: 'Halaman belum ditemukan di penyimpanan. Coba unggah ulang.',
  invalid_webp: 'File halaman bukan WebP yang valid.',
  cleanup_failed: 'Pembersihan belum berhasil. Kamu dapat mencobanya lagi.',
};

export async function editionRequest(action: string, fields: Record<string, unknown>) {
  const response = await fetch('/api/admin/editions/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[data.error] ?? 'Permintaan belum berhasil. Coba lagi.');
  return data;
}
