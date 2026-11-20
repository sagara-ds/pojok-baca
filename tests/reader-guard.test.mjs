import assert from 'node:assert/strict';
import test from 'node:test';
import { guardedRoute, safeReturnTo } from '../src/server/reader-guard.ts';

test('guards reader and stats writes without hiding public catalog or stats reads', () => {
  assert.equal(guardedRoute('/books/pergi/read/', 'GET'), 'reader');
  assert.equal(guardedRoute('/read/pergi', 'GET'), 'reader');
  assert.equal(guardedRoute('/onboarding/', 'POST'), 'onboarding');
  assert.equal(guardedRoute('/change-password/', 'POST'), 'password_change');
  assert.equal(guardedRoute('/api/stats/', 'POST'), 'stats');
  assert.equal(guardedRoute('/api/stats/', 'GET'), null);
  assert.equal(guardedRoute('/books/pergi/', 'GET'), null);
  assert.equal(guardedRoute('/admin/catalog/upload/', 'GET'), 'admin');
  assert.equal(guardedRoute('/api/admin/login/', 'POST'), 'admin_api');
  assert.equal(guardedRoute('/my-library/', 'GET'), 'library');
});

test('allows internal reader returns and rejects auth loops and open redirects', () => {
  const origin = 'https://pojok-baca.example';
  assert.equal(safeReturnTo('/books/pergi/read/?mode=text', origin), '/books/pergi/read/?mode=text');
  for (const value of ['//example.org', '/\\example.org', '/a/..//example.org', '/%2fexample.org',
    '/onboarding/', '/%6cogin/', '/change-password/', '/api/auth/', '/\\[']) {
    assert.equal(safeReturnTo(value, origin), '/books/', value);
  }
});
