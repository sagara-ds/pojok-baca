/**
 * Buku 18+ telah dihapus dari web atas instruksi pengguna (7 November 2026).
 * Override exclude mencegah manifest dan render memasukkannya kembali.
 * Daftar ini juga menyaring bookmark/riwayat lama di browser.
 */
export const ADULT_SLUGS = new Set<string>([
  // Kandidat kuat — judul/tema eksplisit seksual
  'sex-menemukan-cinta-sejati-dalam-dunia-yang-penuh-kepalsuan',
  'pernikahan-tanpa-cinta-ruthlessly-bedded-forcibly-wedded',
  'kawin-paksa-novel-snowdrop-creative-partner',

  // Kandidat tinjau — romansa dewasa
  'biarkan-aku-mencintaimu-two-alone',
  'cinta-keparat-original-publisher',
  'confess-pengakuan',
  'kekasih-akhir-pekan',
  'serpihan-cinta-bipolar-runaway-husband',
  'semua-tentang-cinta',
  'defeated-by-love',
  'cinta-itu-dipraktekin',
  'semua-ingin-jatuh-cinta-love-quotes-kahlil-gibran',
]);

/**
 * Varian/duplikat yang tidak perlu tampil sebagai kartu terpisah.
 *
 * Key = slug yang disembunyikan, value = slug kanonik yang ditampilkan.
 * Varian tetap bisa dibuka lewat URL langsung (untuk keperluan arsip),
 * tapi tidak muncul di katalog/daftar.
 */
export const HIDDEN_VARIANTS: Record<string, { canonical: string; label: string }> = {
  'a-man-called-ove-indonesian-version': {
    canonical: 'a-man-called-ove',
    label: 'Edisi Indonesia',
  },
  'hujan-2': {
    canonical: 'hujan',
    label: 'Edisi lain',
  },
  'nebula-unedited-version-2': {
    canonical: 'nebula-unedited-version',
    label: 'Edisi lain',
  },
};

export function isAdult(slug: string): boolean {
  return ADULT_SLUGS.has(slug);
}

export function isHiddenVariant(slug: string): boolean {
  return slug in HIDDEN_VARIANTS;
}

/** Slug publik = bukan buku dewasa, bukan varian duplikat. */
export function isPublicSlug(slug: string): boolean {
  return !isAdult(slug) && !isHiddenVariant(slug);
}
