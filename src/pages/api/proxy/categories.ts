// API Proxy for Welib.org Categories
// Falls back to mock data when real API is unavailable (Cloudflare protection)
import type { APIRoute } from 'astro';
import { mockCategories } from '../../../services/mock-data';

const WELIB_API_BASE = 'https://id.welib.org/api';

// Simple in-memory rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30; // Lower limit for categories

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
      },
    });
  }

  try {
    const response = await proxyToWelib('/categories', new URLSearchParams(url.searchParams));

    if (!response.ok) {
      // Upstream error - fall back to mock categories
      console.warn(`Upstream returned ${response.status}, falling back to mock categories`);
      throw new Error(`UPSTREAM_ERROR_${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });
  } catch (error) {
    console.error('Categories proxy error, falling back to mock data:', error);

    return new Response(JSON.stringify(mockCategories), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Mock-Data': 'true',
      },
    });
  }
};