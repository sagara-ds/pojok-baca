import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { normalizeLoginIdentifier, normalizeUsername } from '../src/services/login-identifier.ts';
import { readStudentSpreadsheet } from '../pipeline/lib/student-spreadsheet.mjs';

const headers = 'Nama Lengkap;Kelas;Username;NIS;Password';

async function csvFixture(t, rows) {
  const directory = await mkdtemp(join(tmpdir(), 'pojok-baca-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, 'siswa.csv');
  await writeFile(filename, '\uFEFF' + [headers, ...rows].join('\r\n'));
  return filename;
}

test('login recognizes NIS with leading zeros and keeps usernames in a separate namespace', () => {
  assert.equal(normalizeLoginIdentifier(' 00017 '), '00017');
  assert.equal(normalizeLoginIdentifier(' RaNi.7 '), 'rani.7');
  assert.equal(normalizeUsername('00017'), null);
  assert.equal(normalizeLoginIdentifier('rani@example.test'), null);
});

test('CSV import preserves literal passwords and leading zeros in NIS', async t => {
  const input = await csvFixture(t, ['"Nama, Contoh";XI RPL;SISWA-01;000014;"  Contoh98  "']);
  assert.deepEqual(await readStudentSpreadsheet(input), [{
    row: 2, name: 'Nama, Contoh', className: 'XI RPL', username: 'siswa-01', nis: '000014', password: '  Contoh98  ',
  }]);
});

test('CSV import diagnoses duplicates by row without disclosing any passwords', async t => {
  const input = await csvFixture(t, ['Nama A;XI RPL;SISWA-01;000014;Contoh98', 'Nama B;XI RPL;siswa-01;000015;Contoh99']);
  await assert.rejects(readStudentSpreadsheet(input), error => {
    assert.match(error.message, /^Baris 3: Username atau NIS/u);
    assert.doesNotMatch(error.message, /Contoh9[89]/u);
    return true;
  });
});
