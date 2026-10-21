// API Proxy /api/proxy/books/[...slug] — detail buku single (slug = work key Open Library, mis. OL15302003W)
// Upstream: Open Library (via services/api). Rate limit + cache header + X-Mock-Data bila mock.
import type { APIRoute } from 'astro';
import { fetchBook } from '../../../../services/api';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../../../../utils/rate-limit';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const;

function jsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...extra };
}

/**
 * Extract the rest param from Astro's params object.
 * Astro may provide it as a string ("a/b/c") or as an array (["a","b","c"]),
 * depending on the version/mode - handle both.
 */
function getRestParam(params: Record<string, unknown> | undefined, name: string): string {
  if (!params) return '';
  const raw = params[name] ?? params[`...${name}`];
  if (Array.isArray(raw)) return raw.join('/');
  if (typeof raw === 'string') return raw;
  return '';
}

export const GET: APIRoute = async ({ params, request, url }) => {
  // Detail buku: cache lebih lama karena jarang berubah
  const cacheControl = 'public, max-age=3600, stale-while-revalidate=86400';

  const rateLimit = checkRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const slug = getRestParam(params as Record<string, unknown> | undefined, 'slug');
  const searchParams = new URLSearchParams(url.searchParams).get('q');

  if (!slug) {
    // Tanpa slug -> telusuri list/search endpoint di /api/proxy/books/
    const target = searchParams
      ? `/api/proxy/books/?q=${encodeURIComponent(searchParams)}`
      : '/api/proxy/books/';
    return new Response(JSON.stringify({
      error: 'Slug buku diperlukan',
      code: 'SLUG_REQUIRED',
      hint: `${target} untuk daftar & pencarian`,
    }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  try {
    const book = await fetchBook(slug);

    if (!book) {
      return new Response(JSON.stringify({
        error: 'Buku tidak ditemukan',
        code: 'NOT_FOUND',
      }), {
        status: 404,
        headers: jsonHeaders(),
      });
    }

    return new Response(JSON.stringify(book), {
      status: 200,
      headers: jsonHeaders({
        'Cache-Control': cacheControl,
        ...(book.isMock ? { 'X-Mock-Data': 'true' } : {}),
      }),
    });
  } catch (error) {
    console.error('Book detail proxy error:', error);

    return new Response(JSON.stringify({
      error: 'Gagal mengambil detail buku',
      code: 'UPSTREAM_ERROR',
    }), {
      status: 502,
      headers: jsonHeaders(),
    });
  }
};

// Deprecated: endpoint GET_CATEGORIES lama (welib) sudah tidak ada.
// Gunakan /api/proxy/categories/ untuk kategori.
export const GET_CATEGORIES: APIRoute = async () => new Response(JSON.stringify({
  moved: true,
  endpoint: '/api/proxy/categories/',
}), {
  status: 301,
  headers: { 'Content-Type': 'application/json' },
});
