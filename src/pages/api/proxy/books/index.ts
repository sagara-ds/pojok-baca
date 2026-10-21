// API Proxy /api/proxy/books/ — endpoint list & search
// Upstream: Open Library (via services/api, tanpa langsung memanggil pihak ketiga dari sini)
// Rate limit + cache header + header X-Mock-Data bila jatuh ke mock.
import type { APIRoute } from 'astro';
import { fetchBooks, searchBooks } from '../../../../services/api';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../../../../utils/rate-limit';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const;

function jsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...extra };
}

export const GET: APIRoute = async ({ request, url }) => {
  const rateLimit = checkRateLimit(getClientIp(request));

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const searchParams = url.searchParams;
  const hasSearch = searchParams.has('q');

  try {
    const result = hasSearch
      ? await searchBooks(searchParams.get('q') ?? '', {
          page: Number(searchParams.get('page')) || 1,
          limit: Number(searchParams.get('limit')) || 20,
          category: searchParams.get('category') || undefined,
          language: searchParams.get('language') || undefined,
          sort: (searchParams.get('sort') as 'newest' | 'oldest' | 'popular' | 'title-asc' | 'title-desc') || 'newest',
        })
      : await fetchBooks({
          page: Number(searchParams.get('page')) || 1,
          limit: Number(searchParams.get('limit')) || 20,
          category: searchParams.get('category') || undefined,
          language: searchParams.get('language') || undefined,
          sort: (searchParams.get('sort') as 'newest' | 'oldest' | 'popular' | 'title-asc' | 'title-desc') || 'newest',
        });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders({
        'Cache-Control': CACHE_CONTROL,
        ...(result.isMock ? { 'X-Mock-Data': 'true' } : {}),
      }),
    });
  } catch (error) {
    console.error('Books proxy error:', error);

    return new Response(JSON.stringify({
      error: 'Gagal mengambil data buku',
      code: 'UPSTREAM_ERROR',
    }), {
      status: 502,
      headers: jsonHeaders(),
    });
  }
};
