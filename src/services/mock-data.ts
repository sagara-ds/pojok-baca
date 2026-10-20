/**
 * Mock data for development when Welib.org API is unavailable
 * Matches the expected API response structure
 */

import type { Book, BookListResponse, Category } from './types';

export const mockBooks: Book[] = [
  {
    id: '1',
    slug: 'belajar-pemrograman-dasar',
    title: 'Belajar Pemrograman Dasar dengan Python',
    author: 'Budi Santoso',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Buku ini membahas dasar-dasar pemrograman menggunakan bahasa Python. Cocok untuk pemula yang ingin memulai karir di dunia software development.</p><p>Topik yang dibahas meliputi variabel, tipe data, kontrol alur, fungsi, dan struktur data dasar.</p>',
    category: 'Pemrograman',
    publishedYear: 2023,
    pages: 320,
    language: 'id',
    isbn: '9786021234567',
    readingUrl: '/books/belajar-pemrograman-dasar/read',
  },
  {
    id: '2',
    slug: 'algoritma-dan-struktur-data',
    title: 'Algoritma dan Struktur Data',
    author: 'Dr. Siti Rahayu',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Buku referensi standar untuk mata kuliah Algoritma dan Struktur Data di perguruan tinggi.</p><p>Mencakup analisis kompleksitas, array, linked list, stack, queue, tree, graph, sorting, dan searching algorithms.</p>',
    category: 'Ilmu Komputer',
    publishedYear: 2022,
    pages: 450,
    language: 'id',
    isbn: '9786027654321',
    readingUrl: '/books/algoritma-dan-struktur-data/read',
  },
  {
    id: '3',
    slug: 'pemrograman-web-modern',
    title: 'Pemrograman Web Modern dengan JavaScript',
    author: 'Ahmad Wijaya',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Panduan lengkap membangun aplikasi web modern menggunakan JavaScript ES6+, Node.js, dan framework populer seperti React dan Vue.</p><p>Termasuk best practices, testing, deployment, dan performa optimasi.</p>',
    category: 'Web Development',
    publishedYear: 2024,
    pages: 380,
    language: 'id',
    isbn: '9786029876543',
    readingUrl: '/books/pemrograman-web-modern/read',
  },
  {
    id: '4',
    slug: 'basis-data-dan-sql',
    title: 'Basis Data dan SQL: Teori dan Praktik',
    author: 'Prof. Dr. Ir. Hendra Gunawan',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Buku teks kuliah standar untuk mata kuliah Basis Data. Mencakup konsep relasional, normalisasi, SQL, transaksi, indexing, dan optimasi query.</p><p>Dilengkapi studi kasus dan latihan soal untuk tiap bab.</p>',
    category: 'Ilmu Komputer',
    publishedYear: 2021,
    pages: 410,
    language: 'id',
    isbn: '9786021112233',
    readingUrl: '/books/basis-data-dan-sql/read',
  },
  {
    id: '5',
    slug: 'machine-learning-pemula',
    title: 'Machine Learning untuk Pemula',
    author: 'Dr. Maya Sari',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Pengantar Machine Learning yang mudah dipahami tanpa background matematika yang mendalam.</p><p>Membahas supervised/unsupervised learning, regression, classification, clustering, dan evaluasi model dengan Python scikit-learn.</p>',
    category: 'Data Science',
    publishedYear: 2023,
    pages: 290,
    language: 'id',
    isbn: '9786024445566',
    readingUrl: '/books/machine-learning-pemula/read',
  },
  {
    id: '6',
    slug: 'clean-code-indonesia',
    title: 'Clean Code: Panduan Penulisan Kode Bersih',
    author: 'Robert C. Martin (Terj. Andi Prasetyo)',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Terjemahan resmi buku legendaris "Clean Code" oleh Uncle Bob. Prinsip-prinsip penulisan kode yang readable, maintainable, dan testable.</p><p>Wajib baca untuk semua software developer profesional.</p>',
    category: 'Software Engineering',
    publishedYear: 2020,
    pages: 464,
    language: 'id',
    isbn: '9786027778899',
    readingUrl: '/books/clean-code-indonesia/read',
  },
  {
    id: '7',
    slug: 'desain-sistem-skala-besar',
    title: 'Desain Sistem Skala Besar',
    author: 'Alex Xu (Terj. Tim Penerjemah RPL)',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Buku best-seller tentang system design interview. Mencakup arsitektur microservices, database sharding, caching, load balancing, message queue, dan observability.</p><p>Studi kasus nyata: Twitter, Instagram, YouTube, WhatsApp.</p>',
    category: 'Software Architecture',
    publishedYear: 2022,
    pages: 350,
    language: 'id',
    isbn: '9786029990001',
    readingUrl: '/books/desain-sistem-skala-besar/read',
  },
  {
    id: '8',
    slug: 'keamanan-siber-dasar',
    title: 'Keamanan Siber: Dasar-dasar dan Praktik',
    author: 'Dr. Budi Hartono',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Pengantar keamanan siber untuk mahasiswa dan praktisi IT. Topik: network security, cryptography, web application security, malware analysis, incident response, dan compliance.</p><p>Mengacu pada framework NIST dan ISO 27001.</p>',
    category: 'Keamanan Siber',
    publishedYear: 2023,
    pages: 375,
    language: 'id',
    isbn: '9786023334455',
    readingUrl: '/books/keamanan-siber-dasar/read',
  },
  {
    id: '9',
    slug: 'mobile-development-flutter',
    title: 'Pengembangan Aplikasi Mobile dengan Flutter',
    author: 'Rina Marlina',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Panduan lengkap membangun aplikasi cross-platform iOS dan Android dengan Flutter dan Dart.</p><p>Mencakup widget, state management, navigation, API integration, testing, dan deployment ke Play Store & App Store.</p>',
    category: 'Mobile Development',
    publishedYear: 2024,
    pages: 400,
    language: 'id',
    isbn: '9786026667788',
    readingUrl: '/books/mobile-development-flutter/read',
  },
  {
    id: '10',
    slug: 'devops-dan-ci-cd',
    title: 'DevOps dan CI/CD: Otomatisasi Pipeline Modern',
    author: 'Eko Prasetyo',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Implementasi DevOps culture dan pipeline CI/CD menggunakan GitHub Actions, GitLab CI, Jenkins, Docker, Kubernetes, dan monitoring tools.</p><p>Best practices untuk deployment zero-downtime dan rollback strategies.</p>',
    category: 'DevOps',
    publishedYear: 2023,
    pages: 330,
    language: 'id',
    isbn: '9786028889900',
    readingUrl: '/books/devops-dan-ci-cd/read',
  },
  {
    id: '11',
    slug: 'pemrograman-fungsional-javascript',
    title: 'Pemrograman Fungsional dengan JavaScript',
    author: 'Dewi Lestari',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Menerapkan konsep functional programming di JavaScript: pure functions, immutability, higher-order functions, composition, functor, monad.</p><p>Menggunakan library fp-ts dan Ramda untuk practical examples.</p>',
    category: 'Web Development',
    publishedYear: 2022,
    pages: 280,
    language: 'id',
    isbn: '9786021213141',
    readingUrl: '/books/pemrograman-fungsional-javascript/read',
  },
  {
    id: '12',
    slug: 'cloud-computing-aws',
    title: 'Cloud Computing dengan AWS: Panduan Praktis',
    author: 'Bambang Sutrisno (AWS Solutions Architect)',
    coverUrl: '/book-placeholder.svg',
    description: '<p>Panduan hands-on layanan AWS utama: EC2, S3, RDS, Lambda, API Gateway, CloudFormation, CloudWatch, IAM.</p><p>Termasuk arsitektur serverless, cost optimization, dan security best practices.</p>',
    category: 'Cloud Computing',
    publishedYear: 2024,
    pages: 420,
    language: 'id',
    isbn: '9786021516171',
    readingUrl: '/books/cloud-computing-aws/read',
  },
];

export const mockCategories: Category[] = [
  { id: '1', name: 'Pemrograman', slug: 'pemrograman', bookCount: 3 },
  { id: '2', name: 'Ilmu Komputer', slug: 'ilmu-komputer', bookCount: 2 },
  { id: '3', name: 'Web Development', slug: 'web-development', bookCount: 2 },
  { id: '4', name: 'Data Science', slug: 'data-science', bookCount: 1 },
  { id: '5', name: 'Software Engineering', slug: 'software-engineering', bookCount: 1 },
  { id: '6', name: 'Software Architecture', slug: 'software-architecture', bookCount: 1 },
  { id: '7', name: 'Keamanan Siber', slug: 'keamanan-siber', bookCount: 1 },
  { id: '8', name: 'Mobile Development', slug: 'mobile-development', bookCount: 1 },
  { id: '9', name: 'DevOps', slug: 'devops', bookCount: 1 },
  { id: '10', name: 'Cloud Computing', slug: 'cloud-computing', bookCount: 1 },
];

export function getMockBooks(params: { page?: number; limit?: number; category?: string; sort?: string } = {}): BookListResponse {
  const { page = 1, limit = 20, category, sort = 'newest' } = params;

  let filtered = [...mockBooks];

  // Filter by category
  if (category) {
    filtered = filtered.filter(b => b.category.toLowerCase() === category.toLowerCase());
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