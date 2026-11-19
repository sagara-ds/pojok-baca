import type { APIContext } from 'astro';
import { resolveIdentity } from './session';

export const noStore = { 'Cache-Control': 'private, no-store' };
export function apiError(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore });
}

export async function requireApiProfile(context: APIContext, admin = false) {
  try {
    const identity = context.locals.identity ?? await resolveIdentity(context);
    if (identity.status === 'guest') return apiError('login_required', 401);
    if (identity.status !== 'ready') return apiError(identity.status, 403);
    if (admin && identity.profile.role === 'user') return apiError('forbidden', 403);
    return identity.profile;
  } catch {
    return apiError('session_unavailable', 503);
  }
}

export function sameOrigin({ request, url }: APIContext) {
  return request.headers.get('Origin') === url.origin;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function intInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('Content-Length')) > max) throw new RangeError('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new RangeError('body_too_large');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
