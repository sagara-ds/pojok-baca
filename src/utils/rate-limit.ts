/**
 * In-memory rate limiter sederhana untuk API routes (per IP).
 * Perilaku sama dengan implementasi yang sebelumnya diduplikasi
 * di setiap file route proxy — sekarang dipusatkan di sini.
 */

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 menit
const DEFAULT_MAX = 60; // request per menit

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix detik reset window bila ditolak */
  resetEpoch: number;
  retryAfterSeconds: number;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return 'unknown';
}

export function checkRateLimit(ip: string, max = DEFAULT_MAX): RateLimitResult {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, limit: max, remaining: max - 1, resetEpoch: 0, retryAfterSeconds: 0 };
  }

  if (record.count >= max) {
    const resetEpoch = Math.ceil(record.resetTime / 1000);
    return {
      allowed: false,
      limit: max,
      remaining: 0,
      resetEpoch,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetTime - now) / 1000)),
    };
  }

  record.count++;
  return { allowed: true, limit: max, remaining: max - record.count, resetEpoch: 0, retryAfterSeconds: 0 };
}

/**
 * Response 429 siap-kirim dengan header rate limit standar.
 */
export function rateLimitResponse(result: RateLimitResult, bodyLabel = 'Terlalu banyak permintaan'): Response {
  return new Response(JSON.stringify({
    error: bodyLabel,
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: result.retryAfterSeconds,
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(result.resetEpoch),
    },
  });
}
