/**
 * Membersihkan nama file Drive menjadi judul/penulis/slug.
 *
 * Pola nama di folder sumber: "Salinan Salinan <Judul> by <Penulis>.pdf",
 * kadang disisipi "Salinan", "_Z_Library", " ( WeLib.org )", atau "(1)" duplikat.
 */

/** Token sisa yang harus dibuang dari nama file. */
const JUNK_PATTERNS = [
  /_Z_Library/gi,
  /\(\s*WeLib\.org\s*\)/gi,
  /\(\s*Welib\.org\s*\)/gi,
  /_compress\b/gi,
  /\bCopy\s+of\s+/gi,
];

/** Prefix berulang: "Salinan Salinan ...", "Salinan ..." */
const COPY_PREFIX_RE = /^\s*salinan[\s_-]+/i;

/** Sufiks duplikat: " (1)", " (2)" */
const DUP_SUFFIX_RE = /\s*\(\d+\)\s*$/;

/** Penulis di dalam kurung di akhir nama: "(Jack Canfield Mark Victor Hansen)" */
const TRAILING_AUTHOR_RE = /\s*\(([^()]{4,80})\)\s*$/;

export function slugify(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Parse nama file menjadi kandidat judul/penulis.
 * @returns {{title:string, author:string|null, confidence:'high'|'medium'|'low', notes:string[]}}
 */
export function parseFileName(rawName) {
  const notes = [];
  // Buang ekstensi apa pun (.pdf, .epub, .mobi, ...).
  let base = String(rawName).replace(/\.[A-Za-z0-9]{2,5}$/, '');

  // Nama seperti "bandit-bandit-berkelas-by-tere-liye" -> "bandit bandit berkelas by tere liye".
  base = base.replace(/[-_]by[-_]/i, ' by ');

  for (const pattern of JUNK_PATTERNS) base = base.replace(pattern, ' ');

  let previous;
  do {
    previous = base;
    base = base.replace(COPY_PREFIX_RE, '');
  } while (base !== previous);

  base = base.replace(DUP_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();

  let title = base;
  let author = null;

  const byIndex = base.toLowerCase().lastIndexOf(' by ');
  if (byIndex > 0) {
    title = base.slice(0, byIndex).trim();
    author = base.slice(byIndex + 4).trim();
    if (author.length > 80) {
      notes.push('penulis mencurigakan (>80 karakter), dibuang');
      author = null;
    }
  } else {
    const parenMatch = base.match(TRAILING_AUTHOR_RE);
    if (parenMatch) {
      const candidate = parenMatch[1].trim();
      // Penulis yanguga valid: 1-4 kata kapital, tidak mengandung kata umum
      const words = candidate.split(/\s+/);
      const looksLikeName =
        words.length >= 1 &&
        words.length <= 5 &&
        /^[A-Z]/.test(candidate) &&
        !/\b(Vol|Volume|Volume|Jilid|Chapter|Bab)\b/i.test(candidate);
      if (looksLikeName) {
        author = candidate;
        title = base.slice(0, parenMatch.index).trim();
        notes.push('penulis diambil dari kurung di akhir nama');
      }
    }
  }

  title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (author) author = author.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // Judul berbentuk slug tanpa spasi: "bandit-bandit-berkelas" -> "bandit bandit berkelas".
  if (!title.includes(' ') && title.includes('-')) {
    title = title.replace(/-/g, ' ');
  }

  // Nomor seri di depan judul: "1. Tere Liye - Negeri Para Bedebah" -> "Tere Liye - ...".
  const seriesMatch = title.match(/^(\d{1,2})[.)]\s+(.{3,})$/);
  if (seriesMatch) {
    title = seriesMatch[2].trim();
    notes.push(`nomor seri "${seriesMatch[1]}." dibuang dari judul`);
  }

  if (!title) {
    title = base.replace(/_/g, ' ').trim() || 'Tanpa Judul';
    notes.push('judul kosong, fallback ke nama file');
  }

  let confidence = 'high';
  if (!author) {
    confidence = 'low';
    notes.push('penulis tidak ditemukan di nama file');
  } else if (title.length < 3) {
    confidence = 'low';
  }

  return { title, author, confidence, notes };
}

/**
 * Kunci normalisasi untuk deteksi duplikat.
 * Parenthetical tetap dipertahankan supaya "A Man Called Ove" dan
 * "A Man Called Ove (Indonesian Version)" tidak dianggap buku yang sama.
 */
export function titleKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

export function authorKey(author) {
  if (!author) return '';
  return String(author)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Judul dari sumber yang jelas-jelas bukan judul buku. */
export function looksLikeJunk(title) {
  if (!title) return true;
  const t = String(title).trim();
  if (t.length < 2) return true;
  if (/camscanner/i.test(t)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(t)) return true;
  if (/[\\/]/.test(t)) return true;
  if (/^(D|C):/i.test(t)) return true;
  return false;
}

/** Buang derau dari judul: prefix tag "{ Candys}", jejak converter, im penerbit. */
export function cleanTitle(title) {
  if (!title) return '';
  let t = String(title).trim();
  t = t.replace(/^\{[^{}]{1,14}\}\s*/g, ''); // { Candys} {LV} {SB}
  t = t.replace(/^\[[^\]]{1,14}\]\s*/g, ''); // [LV]
  t = t.replace(/\s*[-:|]\s*MetroPop\s*$/i, ''); // jejak penerbit
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Ubah judul yang seluruhnya huruf besar menjadi Title Case.
 * Kata yang mengandung angka ("52M", "23:59") tidak diubah.
 */
export function normalizeTitleCase(title) {
  if (!title) return title;
  const letters = title.replace(/[^a-zA-Z]/g, '');
  if (!letters.length) return title;
  const upperRatio = (letters.match(/[A-Z]/g) ?? []).length / letters.length;
  if (upperRatio < 0.7) return title;
  return title.replace(/[A-Za-z]+/g, (word) => {
    if (/\d/.test(word)) return word;
    if (word.length <= 1) return word.toUpperCase();
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  });
}

function normKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Pilih judul final dari dua kandidat (metadata PDF & hasil parse nama file).
 *
 * Koleksi ini memakai dua konvensi nama: "Salinan X by Y.pdf" (dominan, andal)
 * dan nama hasil converter. Metadata PDF kadang akurat ("23:59"), kadang sampah
 * ("CamScanner 09-05-2024 21.19").
 */
export function pickTitle(metaTitle, nameTitle) {
  const m = cleanTitle(metaTitle);
  const n = cleanTitle(nameTitle);
  const mOk = !looksLikeJunk(m);
  const nOk = !looksLikeJunk(n);

  if (mOk && nOk) {
    // Sama setelah normalisasi -> pakai metadata (biasanya lebih presisi, mis. "23:59").
    if (normKey(m) === normKey(n)) return normalizeTitleCase(m);
    // Judul jauh lebih panjang biasanya yang benar.
    if (m.length > n.length * 1.4) return normalizeTitleCase(m);
    if (n.length > m.length * 1.4) return normalizeTitleCase(n);
    return normalizeTitleCase(n);
  }
  if (mOk) return normalizeTitleCase(m);
  if (nOk) return normalizeTitleCase(n);
  return normalizeTitleCase(m || n || 'Tanpa Judul');
}

/** Penulis: metadata & nama file, pilih yang tidak kosong & bukan derau. */
export function pickAuthor(metaAuthor, nameAuthor) {
  const candidates = [metaAuthor, nameAuthor].filter(Boolean).map((a) => String(a).trim());
  if (!candidates.length) return '';
  const named = candidates.find((a) => !looksLikeJunk(a));
  const chosen = named ?? candidates[0];
  return normalizeTitleCase(chosen);
}

/** Slug unik: tambah sufiks angka bila sudah dipakai. */
export function uniqueSlug(base, taken) {
  let slug = base || 'buku';
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const result = `${base}-${n}`;
  taken.add(result);
  return result;
}
