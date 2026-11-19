import type { BookListResponse, SearchParams, Category } from './types';
import { listPublicBooks, type CatalogBook } from '../server/catalog-repository';

/** Legacy helper for BookDescription. Database synopsis is rendered as text. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim();
}

export function sanitizeText(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function searchScore(book: CatalogBook, phrase: string, terms: string[]) {
  const title = normalize(book.title);
  const author = normalize(book.author);
  const synopsis = normalize(book.description);
  const categories = normalize(book.categories.join(' '));
  let score = (title.includes(phrase) ? 12 : 0) + (synopsis.includes(phrase) ? 6 : 0);
  for (const term of terms) {
    if (title.includes(term)) score += 8;
    if (author.includes(term)) score += 4;
    if (synopsis.includes(term)) score += 2;
    if (categories.includes(term)) score += 2;
  }
  return score;
}

export function browseBooks(catalog: CatalogBook[], params: SearchParams = {}): BookListResponse {
  const { category, year } = params;
  let books = catalog.filter((book) =>
    (!category || book.categories.includes(category)) && (!year || book.publishedYear === year));

  if (params.q?.trim()) {
    const phrase = normalize(params.q.slice(0, 150));
    const terms = phrase.split(' ').filter((term) => term.length >= 2);
    books = terms.length ? books.map((book) => ({ book, score: searchScore(book, phrase, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title, 'id'))
      .map(({ book }) => book) : [];
  }

  const sorters: Record<string, (a: CatalogBook, b: CatalogBook) => number> = {
    'title-asc': (a, b) => a.title.localeCompare(b.title, 'id'),
    'title-desc': (a, b) => b.title.localeCompare(a.title, 'id'),
    popular: (a, b) => (b.readCount ?? 0) - (a.readCount ?? 0) || a.title.localeCompare(b.title, 'id'),
  };
  const sorter = params.sort ? sorters[params.sort] : undefined;
  if (sorter) books.sort(sorter);
  else if (params.sort === 'oldest' && !params.q) books.reverse();

  const total = books.length;
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 12)));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, Math.floor(params.page ?? 1)), totalPages);
  const start = (page - 1) * limit;
  return { data: books.slice(start, start + limit), pagination: { page, limit, total, totalPages } };
}

export async function fetchBooks(params: SearchParams = {}): Promise<BookListResponse> {
  return browseBooks(await listPublicBooks(), params);
}

export async function searchBooks(query: string, params: Omit<SearchParams, 'q'> = {}): Promise<BookListResponse> {
  return fetchBooks({ ...params, q: query });
}

export async function fetchCategories(): Promise<Category[]> {
  const counts = new Map<string, number>();
  for (const book of await listPublicBooks()) {
    for (const name of new Set(book.categories)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, bookCount]) => ({
    id: name, name, slug: normalize(name).replace(/ /g, '-'), bookCount,
  })).sort((a, b) => b.bookCount - a.bookCount);
}
