// API Proxy for Welib.org - Base endpoint (/api/proxy/books/)
// Handles: list, search, pagination
// Falls back to mock data when real API is unavailable (Cloudflare protection)
import type { APIRoute } from 'astro';
import { fetchBooks, searchBooks, sanitizeBook, getMockBooks, searchMockBooks } from '../../../../services/api';
import { mockCategories } from '../../../../services/mock-data';

const WELIB_API_BASE = 'https://id.welib.org/api';

// Simple in-memory rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

async function proxyToWelib(path: string, searchParams: URLSearchParams): Promise<Response> {
  const url = `${WELIB_API_BASE}${path}?${searchParams.toString()}`;

  return fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'PojokBacaRPL/1.0',
    },
    signal: AbortSignal.timeout(10000),
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  const clientIp = getClientIp(request);

  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({
      error: 'Terlalu banyak permintaan',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + RATE_LIMIT_WINDOW) / 1000)),
      },
    });
  }

  const searchParams = new URLSearchParams(url.searchParams);
  const hasSearch = searchParams.has('q');

  try {
    let response: Response;

    if (hasSearch) {
      // Search endpoint
      response = await proxyToWelib('/books/search', searchParams);
    } else {
      // List books with pagination
      response = await proxyToWelib('/books', searchParams);
    }

    if (!response.ok) {
      // Upstream error (403, 404, 500, etc.) - fall back to mock data
      console.warn(`Upstream returned ${response.status}, falling back to mock data`);
      throw new Error(`UPSTREAM_ERROR_${response.status}`);
    }

    const data = await response.json();

    // Sanitize response data
    let sanitizedData;
    if (data.data && Array.isArray(data.data)) {
      sanitizedData = {
        data: data.data.map(sanitizeBook).filter((b): b is NonNullable<typeof b> => b !== null),
        pagination: data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    } else {
      sanitizedData = data;
    }

    // Cache: 5 min for lists, 1 hour stale-while-revalidate
    const cacheControl = 'public, max-age=300, stale-while-revalidate=3600';

    return new Response(JSON.stringify(sanitizedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  } catch (error) {
    console.error('API Proxy error, falling back to mock data:', error);

    // Use mock data as fallback
    const searchParams = new URLSearchParams(url.searchParams);
    const hasSearch = searchParams.has('q');

    let mockResponse;
    if (hasSearch) {
      mockResponse = searchMockBooks(searchParams.get('q') || '', {
        page: Number(searchParams.get('page')) || 1,
        limit: Number(searchParams.get('limit')) || 20,
      });
    } else {
      mockResponse = getMockBooks({
        page: Number(searchParams.get('page')) || 1,
        limit: Number(searchParams.get('limit')) || 20,
        category: searchParams.get('category') || undefined,
        sort: searchParams.get('sort') || 'newest',
      });
    }

    // Cache: 5 min for lists, 1 hour stale-while-revalidate
    const cacheControl = 'public, max-age=300, stale-while-revalidate=3600';

    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Mock-Data': 'true', // Indicate this is mock data
      },
    });
  }
};