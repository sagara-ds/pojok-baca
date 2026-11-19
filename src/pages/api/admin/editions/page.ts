import type { APIRoute } from 'astro';
import { apiError, boundedBody, intInRange, noStore, requireApiProfile, sameOrigin, uuidPattern } from '../../../../server/api-identity';
import { isWebp, maxPageBytes, uploadKey } from '../../../../server/admin-editions';
import { getStorage } from '../../../../lib/storage';

export const prerender = false;
export const PUT: APIRoute = async (context) => {
  const profile = await requireApiProfile(context, true);
  if (profile instanceof Response) return profile;
  if (!sameOrigin(context)) return apiError('invalid_origin', 403);
  const edition = context.url.searchParams.get('edition') ?? '';
  const page = Number(context.url.searchParams.get('page'));
  if (!uuidPattern.test(edition) || !intInRange(page, 1, 5000)
    || context.request.headers.get('Content-Type') !== 'image/webp') return apiError('invalid_page', 400);
  try {
    const storage = await getStorage();
    if (storage.getPresignedPutUrl) return apiError('use_presigned_upload', 405);
    if (!await uploadKey(profile.user_id, edition, page)) return apiError('edition_not_staging', 409);
    const bytes = await boundedBody(context.request, maxPageBytes);
    if (!isWebp(bytes)) return apiError('invalid_webp', 400);
    const key = await uploadKey(profile.user_id, edition, page, 15);
    if (!key) return apiError('edition_not_staging', 409);
    await storage.putWebpIfAbsent(key, bytes);
    return replyStored();
  } catch (error) {
    return apiError('upload_unavailable', error instanceof RangeError ? 413 : 503);
  }
};

function replyStored() {
  return Response.json({ stored: true }, { headers: noStore });
}
