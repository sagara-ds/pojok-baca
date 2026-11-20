import { getDatabase } from './database';
import type { TeacherRow } from '../services/report-format';

export type Dashboard = {
  books: number; students: number; sessions: number; pending: number;
  days: {date: string; sessions: number; pages: number}[];
};
export type Report = { classes: string[]; rows: TeacherRow[] };
export type ModerationItem = { kind: 'quote'|'comment'; id: string; body: string; name: string; title: string; status: string; created:string };
export type Role = 'user'|'admin'|'super_admin';
export type ManagedUser = {
  id: string; name: string; class: string | null; role: Role; active: boolean;
  username: string | null; nis: string | null; mustChangePassword: boolean;
};
export type AuditEntry = { name:string; action:string; created:string; target:Record<string,unknown> };

export async function dashboard(actor: string) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.admin_dashboard(${actor}::uuid) AS data`;
  return row.data as Dashboard | null;
}

export async function report(actor: string, filters: {from:string;to:string;className:string}, exportCsv = false) {
  const sql = getDatabase();
  const {from,to,className} = filters;
  const rows = exportCsv
    ? await sql`SELECT pojok_baca.super_admin_export_report(${actor}::uuid,${from}::date,${to}::date,${className || null}) AS data`
    : await sql`SELECT pojok_baca.teacher_report(${actor}::uuid,${from}::date,${to}::date,${className || null}) AS data`;
  return rows[0].data as Report | null;
}

export async function moderation(actor: string, status: string|null, page: number) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.admin_moderation(${actor}::uuid,${status},${page}::integer) AS data`;
  return row.data as ModerationItem[] | null;
}

export async function managedUsers(actor: string, search: string|null, role: string|null, page: number) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.super_admin_users(${actor}::uuid,${search},${role},${page}::integer) AS data`;
  return row.data as ManagedUser[] | null;
}

export async function audit(actor: string, page: number) {
  const sql = getDatabase();
  const [row] = await sql`SELECT pojok_baca.super_admin_logs(${actor}::uuid,${page}::integer) AS data`;
  return row.data as AuditEntry[] | null;
}

export function adminPage(raw: string|null) {
  const page=Number(raw);
  return Number.isInteger(page) && page>0 ? Math.min(page,100000) : 1;
}

export const roles: Record<Role,string> = { user:'Siswa', admin:'Admin', super_admin:'Super Admin' };
