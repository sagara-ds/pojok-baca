import { defineMiddleware } from 'astro:middleware';
import { guardedRoute } from './server/reader-guard';
import { resolveIdentity } from './server/session';

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
  const route = guardedRoute(context.url.pathname, context.request.method);
  let response: Response | undefined;
  if (route) {
    const api = route === 'stats' || route === 'admin_api';
    try {
      context.locals.identity = await resolveIdentity(context);
      const identity = context.locals.identity;
      const returnTo = encodeURIComponent(context.url.pathname + context.url.search);
      if (identity.status === 'inactive') {
        response = api
          ? Response.json({ error: 'account_inactive' }, { status: 403 })
          : new Response('Akun tidak aktif.', { status: 403 });
      } else if (identity.status === 'guest') {
        response = api
          ? Response.json({ error: 'login_required' }, { status: 401 })
          : context.redirect(`/login/?next=${returnTo}`);
      } else if (identity.status === 'needs_password_change' && route !== 'password_change') {
        response = api
          ? Response.json({ error: 'password_change_required', path: '/change-password/' }, { status: 403 })
          : context.redirect(`/change-password/?next=${returnTo}`);
      } else if (identity.status === 'needs_onboarding' && route !== 'onboarding') {
        response = api
          ? Response.json({ error: 'onboarding_required', path: '/onboarding/' }, { status: 403 })
          : context.redirect(`/onboarding/?next=${returnTo}`);
      } else if ((route === 'admin' || route === 'admin_api') && identity.status === 'ready' && identity.profile.role === 'user') {
        response = api
          ? Response.json({ error: 'forbidden' }, { status: 403 })
          : new Response('Akses ditolak.', { status: 403 });
      }
    } catch {
      response = api
        ? Response.json({ error: 'session_unavailable' }, { status: 503 })
        : new Response('Sesi tidak dapat diperiksa. Coba lagi nanti.', { status: 503 });
    }
  }
  response ??= await next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (route) headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
