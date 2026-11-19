import { config } from '../config.mjs';

/**
 * Watermark digosok ke gambar saat pipeline berjalan (bukan saat runtime),
 * jadi tetap tertanam di file WebP walau gambarnya di-screenshot/disalin.
 *
 * Dua lapis:
 *  1. Pola teks miring yang berulang di seluruh halaman (sulit di-crop).
 *  2. Corner mark berisi slug buku (membedakan edisi/sumber).
 */

const FONT_STACK = 'Arial, Helvetica, "Segoe UI", sans-serif';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * @param {object} options
 * @param {number} options.width  lebar hasil render (px)
 * @param {number} options.height tinggi hasil render (px)
 * @param {string} options.slug   slug buku (untuk corner mark)
 * @param {string} [options.brand]
 * @param {number} [options.opacity]
 * @param {number} [options.cornerOpacity]
 * @returns {Buffer} SVG siap pakai untuk sharp.composite()
 */
export function buildWatermarkSvg({
  width,
  height,
  slug,
  brand = config.watermark.brand,
  opacity = config.watermark.opacity,
  cornerOpacity = config.watermark.cornerOpacity,
}) {
  const tileWidth = 600;
  const tileHeight = 280;
  const fontSize = Math.max(20, Math.min(36, Math.round(width / 28)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="wm" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
      <text x="10" y="${Math.round(tileHeight / 2)}" font-family='${FONT_STACK}' font-size="${fontSize}" font-weight="bold" fill="rgba(0,0,0,${opacity})">${escapeXml(brand)}</text>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#wm)"/>
  <text x="${width - 14}" y="${height - 14}" text-anchor="end" font-family='${FONT_STACK}' font-size="18" fill="rgba(0,0,0,${cornerOpacity})">${escapeXml(slug)}</text>
</svg>`;

  return Buffer.from(svg, 'utf8');
}

/** Watermark kosong (saat dimatikan) agar pemanggil tidak perlu branching. */
export function emptyOverlay() {
  return [];
}
