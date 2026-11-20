import { randomBytes } from 'node:crypto';
import type { APIContext } from 'astro';
import { getDatabase } from './database';
import { getNeonAuth } from './session';

type AuthAdmin = {
  hasPermission(input: { permissions: { user: ['set-password'] } }): Promise<{
    data: { success: boolean } | null; error: { status: number } | null;
  }>;
  setUserPassword(input: { userId: string; newPassword: string }): Promise<{
    data: { status: boolean } | null; error: { status: number } | null;
  }>;
};

export async function changeStudentPassword(context: APIContext, userId: string, currentPassword: string, newPassword: string) {
  const sql = getDatabase();
  const [{ operation }] = await sql`SELECT pojok_baca.begin_school_password_change(${userId}::uuid) AS operation`;
  if (!operation) return 'busy';
  const cookies: Array<() => void> = [];
  let changed = false;
  let rejected = false;
  try {
    const result = await getNeonAuth(context, cookies).changePassword({
      currentPassword, newPassword, revokeOtherSessions: true,
    });
    changed = !result.error && result.data?.user?.id === userId;
    rejected = result.error?.status === 400 || result.error?.status === 401;
  } catch {
    // Neon can fail after the request was sent. Keep the password-change requirement on failure.
  }
  if (changed) cookies.forEach(write => write());
  try {
    const [{ finished }] = await sql`
      SELECT pojok_baca.finish_school_password_change(${userId}::uuid,${userId}::uuid,${operation}::uuid,${changed}) AS finished`;
    if (!finished) return changed ? 'unconfirmed' : 'unavailable';
  } catch {
    return changed ? 'unconfirmed' : 'unavailable';
  }
  return changed ? 'ok' : rejected ? 'invalid' : 'unavailable';
}

export async function resetStudentPassword(context: APIContext, actor: string, student: string) {
  // @neon/auth exposes the admin endpoints on its server proxy and types the namespace as unknown.
  const admin = getNeonAuth(context).admin as AuthAdmin;
  const permission = await admin.hasPermission({ permissions: { user: ['set-password'] } });
  if (permission.error && permission.error.status !== 403) return { status: 'reset_failed' } as const;
  if (!permission.data?.success) return { status: 'auth_permission_required' } as const;
  const sql = getDatabase();
  const [{ operation }] = await sql`SELECT pojok_baca.super_admin_prepare_password_reset(${actor}::uuid,${student}::uuid) AS operation`;
  if (!operation) return { status: 'not_available' } as const;

  const password = randomBytes(18).toString('base64url');
  let changed = false;
  let forbidden = false;
  try {
    const response = await admin.setUserPassword({ userId: student, newPassword: password });
    changed = !response.error && response.data?.status === true;
    forbidden = response.error?.status === 403;
  } catch {
    // An unconfirmed Auth operation never returns a temporary password.
  }
  const [{ finished }] = await sql`
    SELECT pojok_baca.finish_school_password_change(${actor}::uuid,${student}::uuid,${operation}::uuid,${changed}) AS finished`;
  if (finished && changed) return { status: 'ok', password } as const;
  return { status: forbidden ? 'auth_permission_required' : 'reset_failed' } as const;
}
