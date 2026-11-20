import { createHmac, randomUUID } from 'node:crypto';
import type { APIContext } from 'astro';
import { normalizeLoginIdentifier } from '../services/login-identifier';
import { getDatabase, serverSetting } from './database';
import { getNeonAuth } from './session';

function clientAddress(context: APIContext) {
  const cloudflare = context.request.headers.get('CF-Connecting-IP');
  if (cloudflare) return cloudflare;
  try { return context.clientAddress; }
  catch { return 'unknown'; }
}

export async function signInWithSchoolId(context: APIContext, input: string, password: string) {
  const identifier = normalizeLoginIdentifier(input);
  if (!identifier || !password || password.length > 256) return 'invalid';

  const pepper = serverSetting('NEON_AUTH_COOKIE_SECRET');
  const hmac = (scope: string, value: string) => createHmac('sha256', pepper).update(`${scope}\0${value}`).digest('hex');
  const sql = getDatabase();
  const [target] = await sql`
    SELECT limited, user_id, auth_email FROM pojok_baca.login_target(
      ${identifier}, ${hmac('ip', clientAddress(context))}, ${hmac('identifier', identifier)}
    )`;
  if (target.limited) return 'limited';

  const pendingCookies: Array<() => void> = [];
  const email = target.auth_email ?? `${randomUUID()}@login.pojok-baca.invalid`;
  const { data, error } = await getNeonAuth(context, pendingCookies).signIn.email({ email, password });
  if (error || !target.user_id || data?.user?.id !== target.user_id) return 'invalid';
  const [profile] = await sql`SELECT is_active, must_change_password FROM public.users WHERE user_id = ${target.user_id}::uuid`;
  if (!profile?.is_active) return 'invalid';
  pendingCookies.forEach(write => write());
  return profile.must_change_password ? 'password_change' : 'ok';
}
