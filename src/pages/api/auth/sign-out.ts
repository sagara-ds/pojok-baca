import type { APIRoute } from 'astro';
import { getNeonAuth } from '../../../server/session';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (context.request.headers.get('Origin') !== context.url.origin) {
    return new Response('Asal permintaan tidak valid.', { status: 403, headers });
  }
  try {
    const { error } = await getNeonAuth(context).signOut();
    if (!error) return new Response(null, { status: 303, headers: { ...headers, Location: '/login/' } });
  } catch {
    // Use the same response for provider and configuration errors.
  }
  return new Response('Sesi belum bisa diakhiri. Coba lagi nanti.', { status: 503, headers });
};
