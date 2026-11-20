import type { APIContext } from 'astro';
import { createAuthServer, extractNeonAuthCookies } from '@neon/auth/server';
import { getDatabase, serverSetting } from './database';

export type Profile = {
  user_id: string;
  name: string;
  class_name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  is_active: boolean;
};

export type Identity =
  | { status: 'guest' }
  | { status: 'needs_onboarding'; userId: string; name: string }
  | { status: 'needs_password_change'; userId: string }
  | { status: 'inactive' }
  | { status: 'ready'; profile: Profile };

export function getNeonAuth(
  { request, cookies, url }: Pick<APIContext, 'request' | 'cookies' | 'url'>,
  pendingCookies?: Array<() => void>,
) {
  return createAuthServer({
    baseUrl: serverSetting('NEON_AUTH_BASE_URL'),
    cookieSecret: serverSetting('NEON_AUTH_COOKIE_SECRET'),
    sameSite: 'lax',
    context: () => ({
      getCookies: () => extractNeonAuthCookies(request.headers),
      getHeader: (name) => request.headers.get(name),
      getOrigin: () => url.origin,
      getFramework: () => 'astro',
      setCookie: (name, value, options) => {
        const write = () => cookies.set(name, value, { ...options, path: '/', encode: (raw) => raw });
        if (pendingCookies) pendingCookies.push(write);
        else write();
      },
    }),
  });
}

export async function resolveIdentity(context: APIContext): Promise<Identity> {
  if (!extractNeonAuthCookies(context.request.headers)) return { status: 'guest' };
  const { data, error } = await getNeonAuth(context).getSession({
    query: { disableCookieCache: 'true' },
  });
  if (error) {
    if (error.status === 401) return { status: 'guest' };
    throw new Error('Pemeriksaan sesi gagal.');
  }
  const user = data?.user;
  if (!user) return { status: 'guest' };

  const sql = getDatabase();
  const rows = await sql`
    SELECT user_id, name, class_name, role, is_active, must_change_password, password_revoked_at
    FROM public.users WHERE user_id = ${user.id}::uuid
  `;
  const row = rows[0] as (Profile & { must_change_password: boolean; password_revoked_at: string | Date | null }) | undefined;
  if (row && !row.is_active) return { status: 'inactive' };
  if (row?.password_revoked_at) {
    const issuedAt = new Date(data?.session?.createdAt ?? '').getTime();
    if (!Number.isFinite(issuedAt) || issuedAt <= new Date(row.password_revoked_at).getTime()) return { status: 'guest' };
  }
  if (row?.must_change_password) return { status: 'needs_password_change', userId: user.id };
  const profile: Profile | undefined = row;
  if (!profile?.name.trim() || !profile.class_name?.trim()) {
    return { status: 'needs_onboarding', userId: user.id, name: profile?.name ?? user.name ?? '' };
  }
  return { status: 'ready', profile };
}

export async function completeProfile(userId: string, name: string, className: string) {
  const sql = getDatabase();
  await sql`
    INSERT INTO public.users (user_id, name, class_name)
    VALUES (${userId}::uuid, ${name}, ${className})
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name, class_name = EXCLUDED.class_name, updated_at = now()
    WHERE users.is_active AND users.class_name IS NULL
  `;
}
