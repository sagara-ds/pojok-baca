/**
 * Tipe data katalog buku.
 *
 * Sumber data: `data/books.json` (hasil pipeline `npm run pipe:manifest`).
 * `src/services/books.ts` memetakan manifest itu ke bentuk di bawah.
 */

export interface Book {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  category: string;
  publishedYear?: number;
  pages: number;
  language: string;
  isbn?: string;
  readingUrl?: string;
}

export interface BookListResponse {
  data: Book[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  bookCount: number;
}

export interface SearchParams {
  q?: string;
  category?: string;
  year?: number;
  language?: string;
  sort?: 'newest' | 'oldest' | 'popular' | 'title-asc' | 'title-desc';
  page?: number;
  limit?: number;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}