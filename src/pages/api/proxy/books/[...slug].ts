// API Proxy for Welib.org - Secure server-side proxy with rate limiting and sanitization
import type { APIRoute } from 'astro';
import { fetchBook, fetchBooks, searchBooks, fetchCategories, sanitizeBook } from '../../../../services/api';

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
  // Check various headers for real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return 'unknown';
}

async function proxyToWelib(path: string, searchParams: URLSearchParams): Promise<Response> {
  const url = `${WELIB_API_BASE}${path}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'PojokBacaRPL/1.0',
    },
    // Add timeout
    signal: AbortSignal.timeout(10000),
  });

  return response;
}

export const GET: APIRoute = async ({ params, request, url }) => {
  const clientIp = getClientIp(request);

  // Rate limiting
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

  const slug = params.slug ? params.slug.join('/') : '';
  const searchParams = new URLSearchParams(url.searchParams);

  try {
    let response: Response;

    if (slug) {
      // Single book detail
      response = await proxyToWelib(`/books/${slug}`, searchParams);
    } else if (searchParams.has('q')) {
      // Search
      response = await proxyToWelib('/books/search', searchParams);
    } else {
      // Book list with pagination
      response = await proxyToWelib('/books', searchParams);
    }

    if (!response.ok) {
      // Return error with sanitized message
      const errorText = await response.text().catch(() => '');
      return new Response(JSON.stringify({
        error: `Gagal mengambil data dari server buku`,
        code: 'UPSTREAM_ERROR',
        status: response.status,
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    const data = await response.json();

    // Sanitize response data
    let sanitizedData;
    if (slug) {
      // Single book
      sanitizedData = sanitizeBook(data);
      if (!sanitizedData) {
        return new Response(JSON.stringify({
          error: 'Data buku tidak valid',
          code: 'INVALID_DATA',
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (data.data && Array.isArray(data.data)) {
      // Book list
      sanitizedData = {
        data: data.data.map(sanitizeBook).filter((b): b is NonNullable<typeof b> => b !== null),
        pagination: data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    } else {
      // Categories or other
      sanitizedData = data;
    }

    // Set cache headers based on endpoint type
    const cacheControl = slug
      ? 'public, max-age=3600, stale-while-revalidate=86400' // Book details: 1 hour cache
      : 'public, max-age=300, stale-while-revalidate=3600'; // Lists: 5 min cache

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
    console.error('API Proxy error:', error);

    // Determine error type
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Terjadi kesalahan internal';

    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        status = 504;
        code = 'UPSTREAM_TIMEOUT';
        message = 'Server buku tidak merespons dalam waktu yang ditentukan';
      } else if (error.message.includes('fetch')) {
        status = 502;
        code = 'UPSTREAM_UNREACHABLE';
        message = 'Tidak dapat menghubungi server buku';
      }
    }

    return new Response(JSON.stringify({
      error: message,
      code,
    }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
};

// Also support categories endpoint
export const GET_CATEGORIES: APIRoute = async ({ request, url }) => {
  const clientIp = getClientIp(request);

  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Terlalu banyak permintaan', code: 'RATE_LIMIT_EXCEEDED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await proxyToWelib('/categories', new URLSearchParams(url.searchParams));

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Gagal mengambil kategori', code: 'UPSTREAM_ERROR' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Categories: 1 day cache
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Categories proxy error:', error);
    return new Response(JSON.stringify({ error: 'Gagal mengambil kategori', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};