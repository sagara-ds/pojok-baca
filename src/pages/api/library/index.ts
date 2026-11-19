import type { APIRoute } from 'astro';
import { apiError, boundedBody, requireApiProfile, sameOrigin, uuidPattern, noStore, intInRange } from '../../../server/api-identity';
import { getDatabase } from '../../../server/database';
import { libraryTab } from '../../../server/student-library';

export const prerender = false;
const actions = new Set(['remove_book','remove_anchor','remove_quote','request_quote','private_quote']);

export const POST: APIRoute = async (context) => {
  const profile = await requireApiProfile(context);
  if (profile instanceof Response) return profile;
  if (profile.role !== 'user' || !sameOrigin(context)) return apiError('forbidden', 403);
  try {
    const form = new URLSearchParams(new TextDecoder().decode(await boundedBody(context.request, 2000)));
    const action = form.get('action') ?? '';
    const slug = form.get('slug');
    const edition = form.get('edition');
    const quote = form.get('quote');
    const page = form.has('page') ? Number(form.get('page')) : null;
    const paragraph = form.has('paragraph') ? Number(form.get('paragraph')) : null;
    if (!actions.has(action) || (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      || (edition && !uuidPattern.test(edition)) || (quote && !/^\d{1,18}$/.test(quote))
      || (page !== null && !intInRange(page,1,2147483647))
      || (paragraph !== null && !intInRange(paragraph,0,2147483647))) return apiError('invalid_action', 400);
    const sql = getDatabase();
    const [{ changed }] = await sql`
      SELECT pojok_baca.change_student_library(${profile.user_id}::uuid,${action},${slug},
        ${edition}::uuid,${page}::integer,${paragraph}::integer,${quote}::bigint) AS changed`;
    if (!changed) return apiError('item_not_found', 404);
    return new Response(null, { status: 303, headers: { ...noStore, Location: `/my-library/?tab=${libraryTab(form.get('tab'))}&saved=1` } });
  } catch (error) {
    return apiError('library_unavailable', error instanceof RangeError ? 413 : 503);
  }
};
