import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { createAuthServer } from '@neon/auth/server';
import { Client } from '@neondatabase/serverless';
import { readStudentSpreadsheet, StudentSheetError } from './lib/student-spreadsheet.mjs';

class ImportError extends Error {}

function configuration() {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const origin = process.env.PB_IMPORT_ORIGIN ?? 'http://localhost:4321';
  if (!direct || !baseUrl || !process.env.PB_IMPORT_HOST) {
    throw new ImportError('Atur DATABASE_URL_UNPOOLED, PB_IMPORT_HOST, dan NEON_AUTH_BASE_URL untuk branch tujuan.');
  }
  try {
    const database = new URL(direct);
    const auth = new URL(baseUrl);
    const site = new URL(origin);
    const [endpoint, ...region] = database.hostname.split('.');
    if (!/^ep-[a-z0-9-]+$/u.test(endpoint) || endpoint.endsWith('-pooler') ||
      database.hostname !== process.env.PB_IMPORT_HOST || !database.hostname.endsWith('.neon.tech') ||
      auth.protocol !== 'https:' || auth.username || auth.password || auth.search || auth.hash ||
      auth.hostname !== [endpoint, 'neonauth', ...region].join('.') ||
      auth.pathname.replace(/\/$/, '') !== `${database.pathname}/auth` ||
      (site.protocol !== 'https:' && !(site.protocol === 'http:' && site.hostname === 'localhost')) || site.origin !== origin) {
      throw new Error();
    }
  } catch {
    throw new ImportError('Koneksi direct, Auth URL, dan origin harus cocok dengan branch yang dipilih.');
  }
  return { direct, baseUrl, origin };
}

async function transaction(db, run) {
  await db.query('BEGIN');
  try {
    const value = await run();
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function existingProfile(db, { username, nis }) {
  const { rows } = await db.query('SELECT username, nis, role FROM public.users WHERE username=$1 OR nis=$2', [username, nis]);
  if (!rows.length) return false;
  if (rows.length === 1 && rows[0].role === 'user' && rows[0].username === username && rows[0].nis === nis) return true;
  throw new ImportError('Username/NIS berbenturan dengan profil lain.');
}

async function findReservedAccount(db, email) {
  const { rows } = await db.query('SELECT id FROM neon_auth."user" WHERE email=$1', [email]);
  return rows[0]?.id;
}

async function withAuthRetry(operation) {
  for (const wait of [0, 10_000, 20_000, 40_000]) {
    if (wait) await delay(wait);
    const result = await operation();
    if (result.error?.status !== 429) return result;
  }
  throw new ImportError('Neon Auth masih membatasi percobaan. Jalankan ulang impor setelah jeda.');
}

async function importStudent(db, auth, student) {
  const { username, nis, name, className, password } = student;
  if (await existingProfile(db, student)) return 'skipped';

  await db.query(`INSERT INTO pojok_baca.student_import_reservations (username, nis, auth_email)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [username, nis, `${randomUUID()}@students.pojok-baca.invalid`]);

  return transaction(db, async () => {
    const { rows } = await db.query(`SELECT username, nis, auth_email
      FROM pojok_baca.student_import_reservations WHERE username=$1 OR nis=$2 ORDER BY username FOR UPDATE`, [username, nis]);
    if (await existingProfile(db, student)) {
      await db.query('DELETE FROM pojok_baca.student_import_reservations WHERE username=$1 AND nis=$2', [username, nis]);
      return 'skipped';
    }
    if (rows.length !== 1 || rows[0].username !== username || rows[0].nis !== nis) {
      throw new ImportError('Username/NIS berbenturan dengan impor yang tertunda.');
    }

    const email = rows[0].auth_email;
    let id = await findReservedAccount(db, email);
    let needsVerification = Boolean(id);
    if (!id) {
      const created = await withAuthRetry(() => auth.signUp.email({ name, email, password }));
      if (created.error || !created.data?.user?.id || created.data.user.email !== email) {
        throw new ImportError('Neon Auth menolak pembuatan akun.');
      }
      id = created.data.user.id;
      needsVerification = !created.data.token;
    }
    if (needsVerification) {
      const verified = await withAuthRetry(() => auth.signIn.email({ email, password }));
      if (verified.error || verified.data?.user?.id !== id) {
        throw new ImportError('Akun impor sebelumnya tidak bisa masuk. Periksa password awal dan pengaturan verifikasi Neon Auth.');
      }
    }

    await db.query(`INSERT INTO public.users (user_id, name, class_name, username, nis, role, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, 'user', true, true)`, [id, name, className, username, nis]);
    await db.query('DELETE FROM pojok_baca.student_import_reservations WHERE username=$1 AND nis=$2', [username, nis]);
    return 'created';
  });
}

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { apply: { type: 'boolean' } } });
  if (positionals.length !== 1) throw new ImportError('Pemakaian: npm run db:import-students -- <file.xlsx|file.csv> [--apply]');
  const students = await readStudentSpreadsheet(positionals[0]);
  console.log(`${students.length} baris siswa valid.`);
  if (!values.apply || !students.length) process.exit(0);

  const { direct, baseUrl, origin } = configuration();
  const auth = createAuthServer({
    baseUrl,
    cookieSecret: randomBytes(32).toString('base64url'),
    context: () => ({ getCookies: () => '', setCookie: () => {}, getHeader: () => null, getOrigin: () => origin, getFramework: () => 'astro' }),
  });
  const db = new Client({ connectionString: direct });
  const outcome = { created: 0, skipped: 0, failed: 0 };
  await db.connect();
  try {
    await db.query('SELECT username, nis, must_change_password FROM public.users LIMIT 0');
    await db.query('SELECT username FROM pojok_baca.student_import_reservations LIMIT 0');
    for (const student of students) {
      try { outcome[await importStudent(db, auth, student)]++; }
      catch (error) {
        outcome.failed++;
        console.error(`Baris ${student.row}: ${error instanceof ImportError ? error.message : 'Impor gagal. Jalankan ulang untuk melanjutkan.'}`);
        break;
      }
    }
  } finally { await db.end(); }
  console.log(`Dibuat: ${outcome.created}. Dilewati: ${outcome.skipped}. Gagal: ${outcome.failed}. Tertunda: ${students.length - outcome.created - outcome.skipped - outcome.failed}.`);
  if (outcome.failed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof ImportError || error instanceof StudentSheetError ? error.message : 'Impor siswa gagal. Periksa argumen, koneksi, dan migration 0009–0010.');
  process.exitCode = 1;
}
