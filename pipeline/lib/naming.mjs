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

/**
 * Penulis di depan judul: "Tere Liye - Hujan".
 * Hanya kalau bagian kiri benar-benar terlihat seperti nama (2-3 kata kapital).
 */
const LEADING_AUTHOR_RE = /^([A-Z][a-zA-Z'’.]+(?:\s+[A-Z][a-zA-Z'’.]+){1,2})\s+[-–—]\s+(.+)$/;

/** Kata yang pernah jadi bagian nama tapi bukan nama orang. */
const NOT_A_NAME_RE = /\b(the|and|for|from|with|bisa|tapi|yang|dan|atau|ini|itu|adalah)\b/i;

function looksLikeName(value) {
  if (!value) return false;
  if (value.length > 24) return false;
  if (/\d/.test(value)) return false;
  if (NOT_A_NAME_RE.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'’.]+$/.test(w));
}

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

  // Nomor seri di depan judul dibuang lebih dulu, supaya pola
  // "1. Tere Liye - Negeri Para Bedebah" masih bisaparsed sebagai penulis+judul.
  const seriesMatch = base.match(/^(\d{1,2})[.)]\s+(.{3,})$/);
  if (seriesMatch) {
    base = seriesMatch[2].trim();
    notes.push(`nomor seri "${seriesMatch[1]}." dibuang dari judul`);
  }

  let title = base;
  let author = null;
  let leadingPair = null;

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
      // Penulis yang dianggap valid: 1-4 kata kapital, tidak mengandung kata umum
      const words = candidate.split(/\s+/);
      const looksLikeName =
        words.length >= 1 &&
        words.length <= 8 &&
        /^[A-Z]/.test(candidate) &&
        !/\b(Vol|Volume|Volume|Jilid|Chapter|Bab)\b/i.test(candidate);
      if (looksLikeName) {
        author = candidate;
        title = base.slice(0, parenMatch.index).trim();
        notes.push('penulis diambil dari kurung di akhir nama');
      }
    }

    // Pola "X - Y" (bisa "Penulis - Judul" atau "Judul - Penulis").
    // Belum diputuskan di sini: nama file sumber memakai kedua pola.
    // Keputusan diambil nanti oleh resolveMeta() dengan bantuan metadata PDF.
    if (!author) {
      const leading = base.match(LEADING_AUTHOR_RE);
      if (leading) {
        leadingPair = { left: leading[1].trim(), right: leading[2].trim() };
        title = leadingPair.right;
        author = leadingPair.left;
        notes.push('pola "X - Y" ditemukan, akan dicocokkan dengan metadata');
      }
    }
  }

  title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (author) author = author.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // Judul berbentuk slug tanpa spasi: "bandit-bandit-berkelas" -> "bandit bandit berkelas".
  if (!title.includes(' ') && title.includes('-')) {
    title = title.replace(/-/g, ' ');
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

  return { title, author, confidence, notes, leadingPair };
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

/** Judul generik yang muncul dari metadata PDF hasil konversi. */
const JUNK_TITLES = new Set([
  'test', 'tests', 'untitled', 'document', 'doc', 'scan', 'scanned', 'image', 'img',
  'pdf', 'output', 'final', 'new', 'copy', 'ok', 'temp', 'draft', 'book', 'novel',
  'file', 'unknown', 'buku', 'judul', 'microsoftword', 'document1', 'doc1',
]);

/** Penulis yang sebenarnya nama situs/alat konverter, bukan nama orang. */
const CONVERTER_AUTHOR_RE = /convert-|\.net\b|\.com\b|camscanner|scanner|software|converter|ocr/i;

/** Judul dari sumber yang jelas-jelas bukan judul buku. */
export function looksLikeJunk(title) {
  if (!title) return true;
  const t = String(title).trim();
  if (t.length < 2) return true;
  if (JUNK_TITLES.has(t.toLowerCase())) return true;
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
  t = t.replace(/\s*[-:|]\s*eBookWave\s*$/i, ''); // jejak sumber
  t = t.replace(/^Microsoft\s+Word\s*[-–—]\s*/i, ''); // jejak Office
  t = t.replace(/\.(docx?|odt|pdf|epub)\s*$/i, ''); // ekstensi nyasar
  t = t.replace(/\s*[-–—]{2,}\s*[^–—]*$/, ''); // sisa " -- Penulis --"
  t = t.replace(/[\s_-]*\btagt\b\s*$/i, ''); // tag navigasi
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
  const named = candidates.find(
    (a) => !looksLikeJunk(a) && !CONVERTER_AUTHOR_RE.test(a),
  );
  const chosen = named ?? candidates.find((a) => !CONVERTER_AUTHOR_RE.test(a)) ?? candidates[0];
  return normalizeTitleCase(chosen);
}

/**
 * Tentukan judul & penulis final memakai metadata PDF + hasil parse nama file.
 *
 * Kasus sulit: nama file "X - Y" bisa berarti "Penulis - Judul"
 * ("Tere Liye - Hujan") atau "Judul - Penulis" ("Fluent English - Barbara R.
 * Raifsnider"). Metadata PDF yang sama bisa jadi tidak berguna
 * ("Microsoft Word - Fluent English.docx"). Jadi kandidat dikumpulkan dulu,
 * lalu dicocokkan dengan metadata:
 *
 *  - metadata judul mengandung bagian kiri  -> kiri = judul
 *  - metadata judul mengandung bagian kanan -> kanan = judul
 *  - metadata penulis cocok dengan salah satu -> yang cocok = penulis
 */
export function resolveMeta(meta, parsed) {
  const metaTitle = cleanTitle(meta?.title);
  const metaAuthor = (meta?.author ?? '').trim();
  const pair = parsed?.leadingPair;

  if (pair) {
    const keyLeft = normKey(pair.left);
    const keyRight = normKey(pair.right);
    const keyMeta = normKey(metaTitle);
    const keyAuthor = normKey(metaAuthor);

    let titleIsLeft = null;
    if (keyMeta && keyMeta.includes(keyLeft) && !keyMeta.includes(keyRight)) titleIsLeft = true;
    else if (keyMeta && keyMeta.includes(keyRight) && !keyMeta.includes(keyLeft)) titleIsLeft = false;

    let authorIsLeft = null;
    if (keyAuthor && keyAuthor === keyLeft) authorIsLeft = true;
    else if (keyAuthor && keyAuthor === keyRight) authorIsLeft = false;

    if (titleIsLeft !== null) {
      return {
        title: titleIsLeft ? pair.left : pair.right,
        author: titleIsLeft ? pair.right : pair.left,
      };
    }
    if (authorIsLeft !== null) {
      return {
        title: authorIsLeft ? pair.right : pair.left,
        author: authorIsLeft ? pair.left : pair.right,
      };
    }
    // Default: bagian kiri dianggap penulis (pola yang paling sering di koleksi ini).
    return { title: pair.right, author: pair.left };
  }

  return { title: pickTitle(meta?.title, parsed?.title), author: pickAuthor(meta?.author, parsed?.author) };
}

/**
 * Basis slug untuk sebuah buku.
 *
 * Memakai judul final (sudah dibersihkan) plus keterangan di dalam kurung
 * bila nama file punya keterangan yang tidak ada di judul akhir. Tanpa ini,
 * "A Man Called Ove" dan "A Man Called Ove (Indonesian Version)" bentrok
 * dan yang kedua berakhir jadi "-2".
 */
export function slugBaseFor(meta, parsed) {
  const { title } = resolveMeta(meta, parsed);
  let base = slugify(cleanTitle(title));

  const qualifier = parsed?.title?.match(/\(([^)]{3,40})\)/)?.[1];
  if (qualifier && !title.includes(qualifier)) {
    base = slugify(`${base}-${qualifier}`);
  }
  return base || 'buku';
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
