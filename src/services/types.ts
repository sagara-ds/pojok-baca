/**
 * Type definitions for Welib.org API response
 * Adjust based on actual API schema
 */

/** Flag opsional yang menandai data berasal dari mock (fallback). */
export interface MockSource {
  isMock?: boolean;
}

export interface Book extends MockSource {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  category: string;
  publishedYear: number;
  pages: number;
  language: string;
  isbn?: string;
  readingUrl?: string;
}

export interface BookListResponse extends MockSource {
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