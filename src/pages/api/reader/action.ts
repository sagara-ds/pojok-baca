import type { APIRoute } from 'astro';
import { apiError, boundedBody, intInRange, noStore, requireApiProfile, sameOrigin, uuidPattern } from '../../../server/api-identity';
import { getDatabase } from '../../../server/database';

export const prerender = false;
const actions = new Set([
  'confirm', 'position', 'begin_page', 'finish_page', 'cancel_page', 'favorite_book', 'favorite_anchor', 'quote',
]);

export const POST: APIRoute = async (context) => {
  const profile = await requireApiProfile(context);
  if (profile instanceof Response) return profile;
  if (!sameOrigin(context)) return apiError('invalid_origin', 403);
  let input;
  try {
    input = JSON.parse(new TextDecoder().decode(await boundedBody(context.request, 12_000)));
  } catch (error) {
    return apiError('invalid_body', error instanceof RangeError ? 413 : 400);
  }
  if (!input || !actions.has(input.action) || typeof input.session !== 'string' || !uuidPattern.test(input.session)
    || (input.index != null && !intInRange(input.index, 0, 2147483647))
    || (input.seq != null && !intInRange(input.seq, 1, 2147483647))
    || (input.visit != null && (typeof input.visit !== 'string' || !uuidPattern.test(input.visit)))
    || (input.enabled != null && typeof input.enabled !== 'boolean')
    || (input.text != null && (typeof input.text !== 'string' || input.text.length > 2000))) {
    return apiError('invalid_action', 400);
  }
  try {
    const sql = getDatabase();
    const [{ data }] = await sql`
      SELECT pojok_baca.reader_action(
        ${profile.user_id}::uuid,${input.session}::uuid,${input.action},
        ${input.index ?? null}::integer,${input.seq ?? null}::integer,${input.visit ?? null}::uuid,
        ${input.enabled ?? null}::boolean,${input.text ?? null}
      ) AS data
    `;
    if (!data) return apiError('session_not_found', 404);
    if (data.error) return apiError(data.error, data.error === 'not_ready' ? 409 : 400);
    return Response.json(data, { headers: noStore });
  } catch {
    return apiError('reader_unavailable', 503);
  }
};
