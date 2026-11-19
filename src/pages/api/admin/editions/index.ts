import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiError, boundedBody, intInRange, noStore, requireApiProfile, sameOrigin, uuidPattern } from '../../../../server/api-identity';
import { cancelEdition, cleanupEdition, confirmStoredPage, finalizeEdition, startEdition, uploadKey } from '../../../../server/admin-editions';
import { getStorage } from '../../../../lib/storage';
import { isAdult } from '../../../../services/curation';

export const prerender = false;
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (value: string) => value.toLowerCase().normalize('NFKD')
  .replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-+|-+$/g, '');
const reply = (body: object, status = 200) => Response.json(body, { status, headers: noStore });

export const POST: APIRoute = async (context) => {
  const profile = await requireApiProfile(context, true);
  if (profile instanceof Response) return profile;
  if (!sameOrigin(context)) return apiError('invalid_origin', 403);
  let input;
  try {
    input = JSON.parse(new TextDecoder().decode(await boundedBody(context.request, 160_000)));
  } catch (error) {
    return apiError('invalid_body', error instanceof RangeError ? 413 : 400);
  }
  if (!input || typeof input.action !== 'string') return apiError('invalid_action', 400);
  const actor = profile.user_id;
  try {
    if (input.action === 'start') {
      const existing = typeof input.existing === 'string' && input.existing ? input.existing : null;
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const author = typeof input.author === 'string' ? input.author.trim() : '';
      const slug = existing ?? slugify(title);
      const synopsis = typeof input.synopsis === 'string' ? input.synopsis.trim() : '';
      const categories = typeof input.categories === 'string'
        ? input.categories.split(',').map((part: string) => part.trim()).filter(Boolean) : [];
      if (!slugPattern.test(slug) || isAdult(slug) || slug.length > 120
        || (!existing && (!title || !author)) || title.length > 200 || author.length > 160
        || synopsis.length > 6000 || categories.length > 12 || categories.some((part: string) => part.length > 60)
        || !intInRange(input.pages, 1, 5000) || typeof input.hash !== 'string' || !/^[0-9a-f]{64}$/.test(input.hash)) {
        return apiError('invalid_book', 400);
      }
      const result = await startEdition(actor, { existing, slug, title, author, synopsis, categories, pages: input.pages, hash: input.hash });
      return result.error ? apiError(result.error, result.error === 'forbidden' ? 403 : 409) : reply(result);
    }

    const { edition } = input;
    if (typeof edition !== 'string' || !uuidPattern.test(edition)) return apiError('invalid_edition', 400);
    if (input.action === 'finalize') {
      const result = await finalizeEdition(actor, edition);
      if (result.error) return apiError(result.error, result.error === 'forbidden' ? 403 : 409);
      const cleanup = [];
      const pending = result.cleanup ?? [];
      const immediate = env.STORAGE_DRIVER === 'github' ? pending.slice(0, 1) : pending;
      for (const previous of immediate) {
        // Publishing has already committed. Storage failures leave an explicit retry item.
        const state = await cleanupEdition(actor, previous).catch(() => ({ error: 'cleanup_failed' }));
        cleanup.push({ edition: previous, ...state });
      }
      cleanup.push(...pending.slice(immediate.length).map(previous => ({ edition: previous, done: false })));
      return reply({ slug: result.slug, cleanup });
    }
    if (input.action === 'cleanup') {
      const state = await cleanupEdition(actor, edition);
      return state.error ? apiError(state.error, state.error === 'cleanup_failed' ? 503 : 409) : reply(state);
    }
    if (input.action === 'cancel') {
      if (!await cancelEdition(actor, edition)) return apiError('edition_not_staging', 409);
      const cleanup = await cleanupEdition(actor, edition).catch(() => ({ error: 'cleanup_failed' }));
      return reply({ canceled: true, cleanup });
    }
    if (!intInRange(input.page, 1, 5000)) return apiError('invalid_page', 400);
    if (input.action === 'confirm') {
      const text = typeof input.text === 'string' ? input.text : '';
      if (text.length > 30000) return apiError('text_too_large', 400);
      const result = await confirmStoredPage(actor, edition, input.page, text);
      return result.error ? apiError(result.error, 409) : reply(result);
    }
    if (input.action === 'target') {
      const key = await uploadKey(actor, edition, input.page);
      if (!key) return apiError('edition_not_staging', 409);
      const storage = await getStorage();
      if (await storage.headObject(key)) return reply({ stored: true });
      if (storage.getPresignedPutUrl) {
        const signedAt = new Date();
        const reserved = await uploadKey(actor, edition, input.page, 90);
        if (!reserved) return apiError('edition_not_staging', 409);
        return reply(await storage.getPresignedPutUrl(reserved, signedAt));
      }
      return reply({
        url: `/api/admin/editions/page/?edition=${edition}&page=${input.page}`,
        headers: { 'Content-Type': 'image/webp' },
      });
    }
    return apiError('invalid_action', 400);
  } catch {
    return apiError('upload_unavailable', 503);
  }
};
