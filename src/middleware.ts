import { defineMiddleware } from 'astro:middleware';

/**
 * Header keamanan untuk SEMUA respons, termasuk halaman HTML yang dirender
 * worker. `public/_headers` Cloudflare hanya diterapkan pada aset statis,
 * jadi halaman HTML SSR butuh jalur ini supaya aturan sama berlaku di
 * host mana pun (Cloudflare, Netlify, node).
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-XSS-Protection': '1; mode=block',
};

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (response instanceof Response) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
  }
  return response;
});
