import type { APIRoute } from 'astro';
import { searchBooks } from '../../services/api';
import type { BookListResponse } from '../../services/types';

const MIN_QUERY = 2;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;

const emptyResult: BookListResponse = {
  data: [],
  pagination: { page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 0 },
};

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < MIN_QUERY) {
    return new Response(JSON.stringify(emptyResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requested = Number(url.searchParams.get('limit')) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), MAX_LIMIT);

  try {
    const result = await searchBooks(q, { limit });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Gagal memuat hasil pencarian', message: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
