/**
 * Mock data for development when Welib.org API is unavailable
 * Matches the expected API response structure
 */

import type { Book, BookListResponse, Category } from './types';

// ---------------------------------------------------------------------------
// Dummy cover generator (SVG data URI)
// ---------------------------------------------------------------------------

const COVER_WIDTH = 300;
const COVER_HEIGHT = 450;

/** Palette pairs [from, to] tuned for the site's dark blue aesthetic */
const COVER_PALETTES: Array<[string, string]> = [
  ['#1d3557', '#4a7ba6'],
  ['#3b1e6e', '#7c3aed'],
  ['#134e4a', '#0d9488'],
  ['#7c2d12', '#ea580c'],
  ['#14532d', '#16a34a'],
  ['#704214', '#d97706'],
  ['#831843', '#ec4899'],
  ['#1e293b', '#64748b'],
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars = 17, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (candidate.length > maxChars) {
      if (line) {
        lines.push(line);
        if (lines.length >= maxLines) {
          line = '';
          break;
        }
      }

      if (word.length > maxChars) {
        let rest = word;
        while (rest.length > maxChars && lines.length < maxLines) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        line = lines.length >= maxLines ? '' : rest;
      } else {
        line = word;
      }
    } else {
      line = candidate;
    }

    if (lines.length >= maxLines) {
      line = '';
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  const consumed = lines.join(' ');
  const normalized = words.join(' ');
  if (lines.length > 0 && consumed.length < normalized.length) {
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex];
    lines[lastIndex] =
      last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }

  return lines;
}

export function generateCover(slug: string, title: string, author: string, category: string): string {
  const [from, to] = COVER_PALETTES[hashString(slug) % COVER_PALETTES.length];
  const titleLines = wrapText(title);
  const titleFontSize = titleLines.some(line => line.length > 14) ? 26 : 30;
  const titleLineHeight = Math.round(titleFontSize * 1.25);
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = Math.round(215 - titleBlockHeight / 2 + titleFontSize * 0.8);

  const categoryText = escapeXml(category.toUpperCase());
  const authorText = escapeXml(author);

  const titleMarkup = titleLines
    .map(
      (line, index) =>
        `<text x="152" y="${titleStartY + index * titleLineHeight}" text-anchor="middle" font-size="${titleFontSize}" font-weight="700" fill="#f8fafc">${escapeXml(line)}</text>`
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}" role="img" aria-label="${escapeXml(title)}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#g)"/>` +
    `<circle cx="262" cy="412" r="72" fill="#ffffff" opacity="0.07"/>` +
    `<circle cx="286" cy="58" r="44" fill="#ffffff" opacity="0.06"/>` +
    `<rect x="18" y="12" width="5" height="426" fill="#ffffff" opacity="0.22"/>` +
    `<text x="40" y="64" font-size="13" font-weight="600" letter-spacing="3" fill="#ffffff" opacity="0.75">${categoryText}</text>` +
    `<text x="40" y="88" font-size="13" font-weight="600" fill="#ffffff" opacity="0.9">POJOK BACA</text>` +
    titleMarkup +
    `<rect x="126" y="336" width="52" height="3" rx="1.5" fill="#ffffff" opacity="0.4"/>` +
    `<text x="150" y="376" text-anchor="middle" font-size="15" font-style="italic" fill="#ffffff" opacity="0.85">${authorText}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Dummy books
// ---------------------------------------------------------------------------

interface DummyBookSeed {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
  publishedYear: number;
  pages: number;
  isbn?: string;
  description: string;
}

function toBook(seed: DummyBookSeed): Book {
  return {
    ...seed,
    language: 'id',
    coverUrl: generateCover(seed.slug, seed.title, seed.author, seed.category),
    readingUrl: `/books/${seed.slug}/read`,
    isbn: seed.isbn,
  };
}

const seeds: DummyBookSeed[] = [
  {
    id: '1',
    slug: 'belajar-pemrograman-dasar',
    title: 'Belajar Pemrograman Dasar dengan Python',
    author: 'Budi Santoso',
    category: 'Pemrograman',
    description: '<p>Buku ini membahas dasar-dasar pemrograman menggunakan bahasa Python. Cocok untuk pemula yang ingin memulai karir di dunia software development.</p>',
    publishedYear: 2023,
    pages: 320,
    isbn: '9786021234567',
  },
  {
    id: '2',
    slug: 'algoritma-dan-struktur-data',
    title: 'Algoritma dan Struktur Data',
    author: 'Dr. Siti Rahayu',
    category: 'Ilmu Komputer',
    description: '<p>Buku referensi standar untuk mata kuliah Algoritma dan Struktur Data di perguruan tinggi.</p><p>Mencakup analisis kompleksitas, array, linked list, stack, queue, tree, graph, sorting, dan searching algorithms.</p>',
    publishedYear: 2022,
    pages: 450,
    isbn: '9786027654321',
  },
  {
    id: '3',
    slug: 'pemrograman-web-modern',
    title: 'Pemrograman Web Modern dengan JavaScript',
    author: 'Ahmad Wijaya',
    category: 'Web Development',
    description: '<p>Panduan lengkap membangun aplikasi web modern menggunakan JavaScript ES6+, Node.js, dan framework populer seperti React dan Vue.</p><p>Termasuk best practices, testing, deployment, dan performa optimasi.</p>',
    publishedYear: 2024,
    pages: 380,
    isbn: '9786029876543',
  },
  {
    id: '4',
    slug: 'basis-data-dan-sql',
    title: 'Basis Data dan SQL: Teori dan Praktik',
    author: 'Prof. Dr. Ir. Hendra Gunawan',
    category: 'Ilmu Komputer',
    description: '<p>Buku teks kuliah standar untuk mata kuliah Basis Data. Mencakup konsep relasional, normalisasi, SQL, transaksi, indexing, dan optimasi query.</p><p>Dilengkapi studi kasus dan latihan soal untuk tiap bab.</p>',
    publishedYear: 2021,
    pages: 410,
    isbn: '9786021112233',
  },
  {
    id: '5',
    slug: 'machine-learning-pemula',
    title: 'Machine Learning untuk Pemula',
    author: 'Dr. Maya Sari',
    category: 'Data Science',
    description: '<p>Pengantar Machine Learning yang mudah dipahami tanpa background matematika yang mendalam.</p><p>Membahas supervised/unsupervised learning, regression, classification, clustering, dan evaluasi model dengan Python scikit-learn.</p>',
    publishedYear: 2023,
    pages: 290,
    isbn: '9786024445566',
  },
  {
    id: '6',
    slug: 'clean-code-indonesia',
    title: 'Clean Code: Panduan Penulisan Kode Bersih',
    author: 'Robert C. Martin (Terj. Andi Prasetyo)',
    category: 'Software Engineering',
    description: '<p>Terjemahan resmi buku legendaris "Clean Code" oleh Uncle Bob. Prinsip-prinsip penulisan kode yang readable, maintainable, dan testable.</p><p>Wajib baca untuk semua software developer profesional.</p>',
    publishedYear: 2020,
    pages: 464,
    isbn: '9786027778899',
  },
  {
    id: '7',
    slug: 'desain-sistem-skala-besar',
    title: 'Desain Sistem Skala Besar',
    author: 'Alex Xu (Terj. Tim Penerjemah RPL)',
    category: 'Software Architecture',
    description: '<p>Buku best-seller tentang system design interview. Mencakup arsitektur microservices, database sharding, caching, load balancing, message queue, dan observability.</p><p>Studi kasus nyata: Twitter, Instagram, YouTube, WhatsApp.</p>',
    publishedYear: 2022,
    pages: 350,
    isbn: '9786029990001',
  },
  {
    id: '8',
    slug: 'keamanan-siber-dasar',
    title: 'Keamanan Siber: Dasar-dasar dan Praktik',
    author: 'Dr. Budi Hartono',
    category: 'Keamanan Siber',
    description: '<p>Pengantar keamanan siber untuk mahasiswa dan praktisi IT. Topik: network security, cryptography, web application security, malware analysis, incident response, dan compliance.</p><p>Mengacu pada framework NIST dan ISO 27001.</p>',
    publishedYear: 2023,
    pages: 375,
    isbn: '9786023334455',
  },
  {
    id: '9',
    slug: 'mobile-development-flutter',
    title: 'Pengembangan Aplikasi Mobile dengan Flutter',
    author: 'Rina Marlina',
    category: 'Mobile Development',
    description: '<p>Panduan lengkap membangun aplikasi cross-platform iOS dan Android dengan Flutter dan Dart.</p><p>Mencakup widget, state management, navigation, API integration, testing, dan deployment ke Play Store & App Store.</p>',
    publishedYear: 2024,
    pages: 400,
    isbn: '9786026667788',
  },
  {
    id: '10',
    slug: 'devops-dan-ci-cd',
    title: 'DevOps dan CI/CD: Otomatisasi Pipeline Modern',
    author: 'Eko Prasetyo',
    category: 'DevOps',
    description: '<p>Implementasi DevOps culture dan pipeline CI/CD menggunakan GitHub Actions, GitLab CI, Jenkins, Docker, Kubernetes, dan monitoring tools.</p><p>Best practices untuk deployment zero-downtime dan rollback strategies.</p>',
    publishedYear: 2023,
    pages: 330,
    isbn: '9786028889900',
  },
  {
    id: '11',
    slug: 'pemrograman-fungsional-javascript',
    title: 'Pemrograman Fungsional dengan JavaScript',
    author: 'Dewi Lestari',
    category: 'Web Development',
    description: '<p>Menerapkan konsep functional programming di JavaScript: pure functions, immutability, higher-order functions, composition, functor, monad.</p><p>Menggunakan library fp-ts dan Ramda untuk practical examples.</p>',
    publishedYear: 2022,
    pages: 280,
    isbn: '9786021213141',
  },
  {
    id: '12',
    slug: 'cloud-computing-aws',
    title: 'Cloud Computing dengan AWS: Panduan Praktis',
    author: 'Bambang Sutrisno (AWS Solutions Architect)',
    category: 'Cloud Computing',
    description: '<p>Panduan hands-on layanan AWS utama: EC2, S3, RDS, Lambda, API Gateway, CloudFormation, CloudWatch, IAM.</p><p>Termasuk arsitektur serverless, cost optimization, dan security best practices.</p>',
    publishedYear: 2024,
    pages: 420,
    isbn: '9786021516171',
  },
  {
    id: '13',
    slug: 'logika-matematika-aplikasinya',
    title: 'Logika Matematika dan Aplikasinya',
    author: 'Prof. Dr. Suparlan',
    category: 'Pendidikan',
    description: '<p>Pengantar logika formal: proposisi, predikat, pembuktian, dan penerapannya dalam informatika serta pemodelan berpikir komputasional.</p><p>Dilengkapi ratusan soal latihan bertingkat untuk belajar mandiri.</p>',
    publishedYear: 2019,
    pages: 286,
    isbn: '9786024561234',
  },
  {
    id: '14',
    slug: 'teori-organisasi-manajemen-modern',
    title: 'Teori Organisasi dan Manajemen Modern',
    author: 'Maria Ulfa, S.Psi., M.M.',
    category: 'Pendidikan',
    description: '<p>Sintesis teori organisasi klasik dan pendekatan kontemporer: struktur, budaya organisasi, kepemimpinan, perubahan, dan dinamika tim.</p><p>Disertai studi kasus organisasi rintisan teknologi Indonesia.</p>',
    publishedYear: 2020,
    pages: 392,
    isbn: '9786027894561',
  },
  {
    id: '15',
    slug: 'filsafat-hidup-anak-muda',
    title: 'Filsafat Hidup untuk Anak Muda: Panduan Menemukan Nalar dan Ketenangan',
    author: 'Rangga Mahendra',
    category: 'Filsafat',
    description: '<p>Buku pengantar filsafat yang ditulis dengan bahasa ringan agar mudah dinikmati pembaca muda.</p><p>Bahas pertanyaan mendasar tentang makna, pilihan hidup, media sosial, dan cara berpikir jernih di tengah banjir informasi.</p><p>Cocok untuk penggemar esai reflektif yang memotivasi.</p>',
    publishedYear: 2024,
    pages: 240,
    isbn: '9786029812345',
  },
  {
    id: '16',
    slug: 'perubahan-kecil-berdampak-besar',
    title: 'Perubahan Kecil yang Berdampak Besar',
    author: 'James Clear (Terj. Sabrina Ayu)',
    category: 'Produktivitas',
    description: '<p>Panduan praktis membangun kebiasaan baik dan menghentikan kebiasaan buruk melalui perubahan kecil yang terukur.</p><p>Sistem kebiasaan 4 langkah, identitas diri, dan desain lingkungan yang mendukung produksi karya.</p>',
    publishedYear: 2021,
    pages: 320,
    isbn: '9786027451236',
  },
  {
    id: '17',
    slug: 'belajar-bahasa-inggris-efektif',
    title: 'Belajar Bahasa Inggris dengan Efektif',
    author: 'Sandra Rahmawati',
    category: 'Bahasa',
    description: '<p>Buku referensi untuk pelajar dan profesional yang ingin menguasai bahasa Inggris secara mandiri.</p><p>Membahas kosakata harian, grammar praktis, teknik listening-shadowing, dan latihan presentasi.</p><p>Termasuk bagian khusus menulis dokumen teknis dalam bahasa Inggris.</p>',
    publishedYear: 2022,
    pages: 210,
    isbn: '9786025123498',
  },
  {
    id: '18',
    slug: 'teori-komunikasi-persuasi',
    title: 'Teori Komunikasi: Persuasi dan Pengaruh',
    author: 'Dr. Fandi Ahmada',
    category: 'Umum',
    description: '<p>Kajian teori komunikasi masa kini: elaboration likelihood model, nudge theory, serta etika persuasi dalam komunikasi publik.</p><p>Dilengkapi studi kasus komunikasi teknologi dan media sosial dari berbagai perspektif.</p>',
    publishedYear: 2020,
    pages: 268,
    isbn: '9786026549871',
  },
  {
    id: '19',
    slug: 'sejarah-peradaban-pulau-jawa',
    title: 'Sejarah Peradaban Pulau Jawa',
    author: 'Umar Kayo (Terj.)',
    category: 'Sejarah',
    description: '<p>Jelajah panjang perjalanan peradaban Jawa dari masa kerajaan bercorak Hindu-Buddha hingga kota-kota dagang pesisir.</p><p>Membahas perdagangan, arsip masa kolonial, kesusasteraan, dan pertanian tradisional yang membentuk identitas agraris masyarakat Jawa.</p><p>Buku dengan pustaka lengkap yang cocok untuk pembaca pemula maupun peneliti.</p>',
    publishedYear: 2018,
    pages: 640,
    isbn: '9786028712564',
  },
  {
    id: '20',
    slug: 'desain-grafis-prinsip-praktik',
    title: 'Desain Grafis: Prinsip dan Praktik Visual',
    author: 'Gita Puspita',
    category: 'Desain',
    description: '<p>Fondasi desain komunikasi visual: grid, tipografi, hierarki, warna, dan teori gestalt dalam praktik nyata.</p><p>Termasuk panduan tools modern dan bagaimana bekerja sama dengan developer.</p>',
    publishedYear: 2023,
    pages: 244,
    isbn: '9786021123987',
  },
  {
    id: '21',
    slug: 'novel-langit-terakhir',
    title: 'Langit yang Terakhir',
    author: 'Andrea Hanifa',
    category: 'Fiksi',
    description: '<p>Novel fiksi ilmiah tentang kadet astronomi yang menemukan sinyal misterius dari balik teleskop tua Observatorium Lembang.</p><p>Cerita yang menggeluti rasa penasaran, cinta, dan langit yang terasa dekat namun tak pernah benar-benar sunyi.</p>',
    publishedYear: 2026,
    pages: 328,
  },
  {
    id: '22',
    slug: 'biografi-habibie',
    title: 'Habibie: Anak Pesawat yang Tak Kenal Menyerah',
    author: 'Tim Kompas Gramedia',
    category: 'Biografi',
    description: '<p>Biografi ringkas B.J. Habibie: dari kampung Parepare, riset pesawat di Jerman, hingga menjabat Presiden ketiga RI.</p><p>Menyoroti teladan hidup, disiplin ilmu, dan semangat merdeka teknologi yang menginspirasi generasi insinyur Indonesia.</p>',
    publishedYear: 2019,
    pages: 356,
    isbn: '9786022923456',
  },
  {
    id: '23',
    slug: 'statistik-terapan-penelitian',
    title: 'Statistik Terapan untuk Penelitian',
    author: 'Dr. Nurhayati Simatupang',
    category: 'Pendidikan',
    description: '<p>Panduan praktis analisis data penelitian: uji hipotesis, korelasi, regresi, ANOVA, dan uji non-parametrik.</p><p>Disertai langkah pengerjaan di software statistik populer serta interpretasi hasilnya.</p>',
    publishedYear: 2021,
    pages: 402,
    isbn: '9786023456987',
  },
  {
    id: '24',
    slug: 'etika-profesi-insinyur',
    title: 'Etika Profesi dalam Rekayasa Perangkat Lunak',
    author: 'Dr. Raditya Wirawan',
    category: 'Umum',
    description: '<p>Buku tipis padat tentang etika profesi insinyur software: privasi data, algoritma yang adil, kredit intelektual, dan profesionalisme.</p>',
    publishedYear: 2022,
    pages: 180,
    isbn: '9786024567893',
  },
];

export const mockBooks: Book[] = seeds.map(toBook);

// ---------------------------------------------------------------------------
// Categories (bookCount derived from mockBooks so it never goes stale)
// ---------------------------------------------------------------------------

const CATEGORY_DEFS: Array<Pick<Category, 'slug' | 'name'>> = [
  { slug: 'pemrograman', name: 'Pemrograman' },
  { slug: 'ilmu-komputer', name: 'Ilmu Komputer' },
  { slug: 'web-development', name: 'Web Development' },
  { slug: 'data-science', name: 'Data Science' },
  { slug: 'software-engineering', name: 'Software Engineering' },
  { slug: 'software-architecture', name: 'Software Architecture' },
  { slug: 'keamanan-siber', name: 'Keamanan Siber' },
  { slug: 'mobile-development', name: 'Mobile Development' },
  { slug: 'devops', name: 'DevOps' },
  { slug: 'cloud-computing', name: 'Cloud Computing' },
  { slug: 'umum', name: 'Umum' },
  { slug: 'pendidikan', name: 'Pendidikan' },
  { slug: 'produktivitas', name: 'Produktivitas' },
  { slug: 'bahasa', name: 'Bahasa' },
  { slug: 'desain', name: 'Desain' },
  { slug: 'filsafat', name: 'Filsafat' },
  { slug: 'fiksi', name: 'Fiksi' },
  { slug: 'biografi', name: 'Biografi' },
  { slug: 'sejarah', name: 'Sejarah' },
];

export const mockCategories: Category[] = CATEGORY_DEFS.map((category, index) => ({
  id: String(index + 1),
  name: category.name,
  slug: category.slug,
  bookCount: mockBooks.filter(book => book.category === category.name).length,
})).filter(category => category.bookCount > 0);

// ---------------------------------------------------------------------------
// Mock service functions
// ---------------------------------------------------------------------------

export function getMockBooks(params: { page?: number; limit?: number; category?: string; q?: string; sort?: string } = {}): BookListResponse {
  const { page = 1, limit = 20, category, sort = 'newest' } = params;

  let filtered = [...mockBooks];

  // Filter by category
  if (category) {
    filtered = filtered.filter(b => b.category.toLowerCase() === category.toLowerCase());
  }

  // Filter by search query
  if (params.q) {
    const q = params.q.toLowerCase().trim();
    filtered = filtered.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (sort) {
    case 'oldest':
      filtered.sort((a, b) => a.publishedYear - b.publishedYear);
      break;
    case 'popular':
      filtered.sort((a, b) => b.pages - a.pages); // proxy: more pages = more popular
      break;
    case 'title-asc':
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'title-desc':
      filtered.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case 'newest':
    default:
      filtered.sort((a, b) => b.publishedYear - a.publishedYear);
      break;
  }

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  const data = filtered.slice(start, end);

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

export function getMockBook(slug: string): Book | null {
  return mockBooks.find(b => b.slug === slug) ?? null;
}

export function searchMockBooks(query: string, params: { page?: number; limit?: number } = {}): BookListResponse {
  const { page = 1, limit = 20 } = params;
  const q = query.toLowerCase().trim();

  const filtered = mockBooks.filter(b =>
    b.title.toLowerCase().includes(q) ||
    b.author.toLowerCase().includes(q) ||
    b.category.toLowerCase().includes(q) ||
    b.description.toLowerCase().includes(q)
  );

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  const data = filtered.slice(start, end);

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}
