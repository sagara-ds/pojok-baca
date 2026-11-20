import type { APIRoute } from 'astro';
import { apiError, boundedBody, noStore, requireApiProfile, sameOrigin, uuidPattern } from '../../../server/api-identity';
import { resetStudentPassword } from '../../../server/student-password';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context)) return apiError('forbidden', 403);
  const actor = await requireApiProfile(context, true);
  if (actor instanceof Response) return actor;
  if (actor.role !== 'super_admin') return apiError('forbidden', 403);
  try {
    const raw = new TextDecoder().decode(await boundedBody(context.request, 512));
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || !('id' in input) ||
        typeof input.id !== 'string' || !uuidPattern.test(input.id) || input.id === actor.user_id) {
      return apiError('invalid_student', 400);
    }
    const result = await resetStudentPassword(context, actor.user_id, input.id);
    if (result.status === 'ok') return Response.json({ password: result.password }, { headers: noStore });
    return apiError(result.status, result.status === 'not_available' ? 409 :
      result.status === 'auth_permission_required' ? 403 : 503);
  } catch (error) {
    return apiError('reset_failed', error instanceof RangeError ? 413 : error instanceof SyntaxError ? 400 : 503);
  }
};
