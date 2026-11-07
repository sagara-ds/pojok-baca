import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, getAdminToken } from '../../../server/auth';
import { getStatsEnv } from '../../../server/stats';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals, url }) => {
  const env = getStatsEnv(locals) as Record<string, unknown>;
  const expectedToken = getAdminToken(env);
  if (!expectedToken) return new Response('Login admin belum dikonfigurasi.', { status: 503 });
  const form = await request.formData();
  const token = String(form.get('token') ?? '');

  if (token !== expectedToken) {
    return new Response(null, { status: 303, headers: { Location: '/admin/?error=1' } });
  }

  cookies.set(ADMIN_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    secure: url.protocol === 'https:',
  });

  return new Response(null, { status: 303, headers: { Location: '/admin/' } });
};
