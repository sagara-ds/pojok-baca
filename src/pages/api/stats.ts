import type { APIRoute } from 'astro';
import {
  getBookStats,
  getStatsEnv,
  recordEvent,
  adjustBookmark,
  type EventType,
} from '../../server/stats';

const VALID: EventType[] = ['pageview', 'read', 'complete', 'bookmark', 'like'];

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getStatsEnv(locals);

  let payload: { type?: string; slug?: string; delta?: number };
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body harus JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const type = payload.type as EventType | undefined;
  if (!type || !VALID.includes(type)) {
    return new Response(JSON.stringify({ error: 'Tipe event tidak valid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type === 'bookmark' && payload.slug) {
    const delta = payload.delta === -1 ? -1 : 1;
    const next = await adjustBookmark(env, payload.slug, delta);
    return new Response(JSON.stringify({ ok: true, count: next }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await recordEvent(env, type, payload.slug);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ url, locals }) => {
  const env = getStatsEnv(locals);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Parameter slug wajib' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stats = await getBookStats(env, slug);
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
