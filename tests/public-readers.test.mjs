import assert from 'node:assert/strict';
import test from 'node:test';
import { maskName, toPublicReader } from '../src/server/public-readers.ts';

test('masks names without exposing short names in full', () => {
  assert.equal(maskName(' Sagara '), 'S****a');
  assert.equal(maskName('Li'), 'L****');
  assert.equal(maskName('A'), '****');
  assert.equal(maskName(''), '****');
});

test('the public reader payload only contains mask, class and relative time', () => {
  const row = {
    userId: 'private-id',
    name: 'Sagara',
    className: 'XI RPL 1',
    email: 'student@example.test',
    nisn: '0001234567',
    lastPage: 24,
    readAt: new Date('2026-11-18T10:00:00Z'),
  };
  assert.deepEqual(toPublicReader(row, new Date('2026-11-18T10:15:00Z')), {
    maskedName: 'S****a',
    className: 'XI RPL 1',
    readTime: '15 menit yang lalu',
  });
});
