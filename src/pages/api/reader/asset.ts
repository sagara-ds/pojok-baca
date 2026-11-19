import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiError, intInRange, requireApiProfile, uuidPattern } from '../../../server/api-identity';
import { getDatabase } from '../../../server/database';
import { isAdult, isPublicSlug } from '../../../services/curation';
import { getStorage } from '../../../lib/storage';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const profile = await requireApiProfile(context);
  if (profile instanceof Response) return profile;
  const edition = context.url.searchParams.get('edition') ?? '';
  const page = Number(context.url.searchParams.get('page'));
  if (!uuidPattern.test(edition) || !intInRange(page, 1, 2147483647)) {
    return apiError('invalid_asset', 400);
  }
  let stage = 'lookup';
  try {
    const sql = getDatabase();
    const [row] = await sql`
      SELECT asset_key, slug FROM pojok_baca.private_reader_asset(${profile.user_id}::uuid,${edition}::uuid,${page})
    `;
    if (!row || isAdult(row.slug) || (profile.role === 'user' && !isPublicSlug(row.slug))) {
      return apiError('asset_not_found', 404);
    }
    let cache: Cache | undefined;
    let cacheKey: Request | undefined;
    let image: Response | undefined;
    if (env.STORAGE_DRIVER === 'github' && typeof caches !== 'undefined') {
      try {
        cache = await caches.open('pojok-baca-private-reader');
        cacheKey = new Request(new URL(`/__private-reader-cache/github/${encodeURIComponent(row.asset_key)}`, context.url.origin));
        image = await cache.match(cacheKey);
      } catch {
        cache = undefined;
      }
    }
    if (!image) {
      stage = 'storage';
      const object = await (await getStorage()).getObjectStream(row.asset_key);
      if (!object) return apiError('asset_not_found', 404);
      stage = 'response';
      image = new Response(object.body, { headers: {
        'Content-Type': 'image/webp', 'Content-Length': String(object.size),
        'Cache-Control': 'public, max-age=86400',
      } });
      try {
        if (cache && cacheKey && context.locals.cfContext) {
          context.locals.cfContext.waitUntil(cache.put(cacheKey, image.clone()).catch(() => {}));
        }
      } catch {
        // The authorized stream remains available when the cache write fails.
      }
    }
    const headers = new Headers(image.headers);
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('Vary', 'Cookie');
    return new Response(image.body, { headers });
  } catch (error) {
    const type = error instanceof Error ? error.name : 'UnknownError';
    const code = (error as { code?: unknown } | null)?.code;
    const detail = error instanceof Error && /^GitHub Storage returned HTTP \d{3}$/u.test(error.message)
      ? error.message : undefined;
    console.warn('Private reader asset unavailable', { stage, type, code: typeof code === 'string' ? code : undefined, detail });
    return apiError('asset_unavailable', 503);
  }
};
