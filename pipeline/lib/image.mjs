import sharp from 'sharp';

/**
 * Deteksi halaman nyaris kosong.
 * Halaman hasil render yang gagal (mis. decoder gambar tidak termuat) keluar
 * sebagai file 2-3 KB dan hampir seluruhnya putih. std dev_channels < 3
 * dipakai sebagai ambang: teks normal punya std dev jauh di atas itu.
 */
export async function blankScore(buffer) {
  const stats = await sharp(buffer).greyscale().stats();
  const channels = stats.channels.map((c) => c.stdev);
  const stdev = Math.min(...channels);
  return { stdev, isBlank: stdev < 3 };
}

/**
 * dHash 8x8 (64 bit) untuk deteksi duplikat "near-duplicate".
 * Dua scan berbeda dari buku yang sama biasanya punya cover yang sangat mirip.
 */
export async function dhash(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

/** Jarak hamming antara dua dHash (0 = identik, 64 = sama sekali berbeda). */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}
