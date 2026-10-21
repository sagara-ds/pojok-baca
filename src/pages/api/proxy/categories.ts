// API Proxy /api/proxy/categories/ — daftar kategori
// Sumber: mock categories (UI berbahasa Indonesia); client Open Library
// memakai slug-ish category kategori ini sebagai subject facet pencarian.
// Upstream kategori via API pihak ketiga dihapus bersama welib.org (403).
import type { APIRoute } from 'astro';
import { mockCategories } from '../../../services/mock-data';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../../../utils/rate-limit';

const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';
const RATE_LIMIT_MAX = 30; // kategori: limit lebih rendah

export const GET: APIRoute = async ({ request }) => {
  const rateLimit = checkRateLimit(getClientIp(request));

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  return new Response(JSON.stringify(mockCategories), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Mock-Data': 'true',
    },
  });
};
