import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { normalizeNis, normalizeUsername } from '../../src/services/login-identifier.ts';

const headings = ['Nama Lengkap', 'Kelas', 'Username', 'NIS', 'Password'];

export class StudentSheetError extends Error {}

export async function readStudentSpreadsheet(path) {
  const extension = extname(path).toLowerCase();
  if (!['.csv', '.xlsx'].includes(extension)) throw new StudentSheetError('Gunakan file .xlsx atau .csv.');
  let rows;
  try {
    const file = await stat(path);
    if (!file.isFile() || file.size > 10 * 1024 * 1024) throw new StudentSheetError('Ukuran file impor maksimal 10 MB.');
    if (extension === '.xlsx') {
      rows = await readSheet(path, 1, { trim: false });
    } else {
      const text = await readFile(path, 'utf8');
      const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
      rows = parse(text, { bom: true, delimiter, relax_column_count: true });
    }
  } catch (error) {
    if (error instanceof StudentSheetError) throw error;
    throw new StudentSheetError('File tidak bisa dibaca. Periksa struktur XLSX atau CSV.');
  }

  const header = (rows[0] ?? []).map(value => String(value ?? '').trim().toLowerCase());
  const indices = headings.map(title => {
    const name = title.toLowerCase();
    if (header.filter(value => value === name).length !== 1) throw new StudentSheetError(`Kolom ${title} harus ada tepat satu kali.`);
    return header.indexOf(name);
  });
  const usernames = new Set();
  const numbers = new Set();
  const students = [];
  rows.slice(1).forEach((values, offset) => {
    const row = offset + 2;
    const [nameValue, classValue, usernameValue, nisValue, password] = indices.map(index => values[index]);
    if ([nameValue, classValue, usernameValue, nisValue, password].every(value => value == null || value === '')) return;
    const fail = description => { throw new StudentSheetError(`Baris ${row}: ${description}`); };
    const text = (value, label, max) => {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/u.test(value)) {
        fail(`${label} harus berisi teks sepanjang 1–${max} karakter.`);
      }
      return value.trim();
    };
    const name = text(nameValue, 'Nama Lengkap', 120);
    const className = text(classValue, 'Kelas', 80);
    const username = typeof usernameValue === 'string' ? normalizeUsername(usernameValue) : null;
    const nis = typeof nisValue === 'string' ? normalizeNis(nisValue) : null;
    if (!username) fail('Username harus 3–40 karakter, memuat huruf, dan hanya memakai huruf, angka, titik, strip, atau garis bawah.');
    if (!nis) fail('NIS harus disimpan sebagai teks berisi 1–32 digit agar nol di depan tetap utuh.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !password.trim() || /[\x00-\x1f\x7f]/u.test(password)) {
      fail('Password harus berupa teks sepanjang 8–128 karakter.');
    }
    if (usernames.has(username) || numbers.has(nis)) fail('Username atau NIS muncul lebih dari sekali di file.');
    usernames.add(username);
    numbers.add(nis);
    students.push({ row, name, className, username, nis, password });
  });
  return students;
}
