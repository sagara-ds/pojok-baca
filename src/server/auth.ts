/**
 * Auth admin sederhana.
 *
 * Token dibaca dari env `PB_ADMIN_TOKEN`. Login dinonaktifkan jika belum diset.
 *
 * Cookie bersifat httpOnly, SameSite=Lax, dan hanya berlaku 12 jam.
 */

export const ADMIN_COOKIE = 'pb_admin';

export function getAdminToken(env: Record<string, unknown> | undefined): string {
  const token = env?.PB_ADMIN_TOKEN;
  return typeof token === 'string' && token.trim().length > 0 ? token : '';
}

export function isAdmin(cookies: { get(name: string): { value: string } | undefined }, env: Record<string, unknown> | undefined): boolean {
  const cookie = cookies.get(ADMIN_COOKIE);
  const token = getAdminToken(env);
  return Boolean(token && cookie && cookie.value === token);
}
