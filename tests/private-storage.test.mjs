import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createLocalStorage } from '../src/lib/storage/local.ts';
import { createGitHubStorage } from '../src/lib/storage/github.ts';
import { createS3Storage } from '../src/lib/storage/s3.ts';
import { stagePublicSite } from '../pipeline/lib/public-site.mjs';

async function fixture(t) {
  const temp = resolve(tmpdir());
  const root = await mkdtemp(join(temp, 'pojok-baca-storage-'));
  assert.ok(root.startsWith(join(temp, 'pojok-baca-storage-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('local storage can write, head, stream, and delete private objects', async (t) => {
  const store = createLocalStorage(await fixture(t));
  const key = 'sheets/test/b001.webp';
  const data = new Uint8Array([29, 3, 255]);
  assert.equal(await store.headObject(key), null);
  await store.putObject(key, data);
  assert.deepEqual(await store.headObject(key), { size: 3, contentType: 'image/webp' });
  const object = await store.getObjectStream(key);
  assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()), data);
  await store.deleteObjects([key, key]);
  assert.equal(await store.getObjectStream(key), null);
});

test('local storage rejects traversal and platform device keys', async (t) => {
  const store = createLocalStorage(await fixture(t));
  for (const key of ['../source', 'books/../../source', 'books\\outside', 'books//b001.webp', 'C:/data', 'sheets/NUL.webp']) {
    await assert.rejects(store.putObject(key, new Uint8Array([1])), /Invalid private storage key/);
    await assert.rejects(store.deleteObjects([key]), /Invalid private storage key/);
  }
});

test('confirmed pages cannot be overwritten by a second local upload', async (t) => {
  const store = createLocalStorage(await fixture(t));
  const key = 'sheets/test/b001.webp';
  assert.equal(await store.putWebpIfAbsent(key, new Uint8Array([31])), true);
  assert.equal(await store.putWebpIfAbsent(key, new Uint8Array([32])), false);
  const object = await store.getObjectStream(key);
  assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()), new Uint8Array([31]));
});

test('S3 presign constrains one key to a short and create-only WebP PUT', async () => {
  const storage = createS3Storage({
    bucket: 'reader-fixture', endpoint: 'https://example.r2.cloudflarestorage.com', region: 'auto',
    accessKeyId: 'fixture-access-key', secretAccessKey: 'fixture-secret',
  });
  const target = await storage.getPresignedPutUrl('sheets/test/b001.webp', new Date('2026-11-18T10:00:00Z'));
  const url = new URL(target.url);
  assert.equal(url.pathname, '/reader-fixture/sheets/test/b001.webp');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
  const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders').split(';');
  assert.deepEqual(signedHeaders.filter((header) => header !== 'host'),
    ['cache-control', 'content-type', 'if-none-match']);
  assert.equal(target.headers['Content-Type'], 'image/webp');
  assert.equal(target.headers['If-None-Match'], '*');
});

const githubFixture = { owner: 'reader', repo: 'private-assets', branch: 'main', token: 'fixture-token' };

test('GitHub reads authenticated raw WebP streams and falls back to size metadata', async t => {
  const key = 'sheets/test/b001.webp';
  const image = new Uint8Array([82, 73, 70, 70]);
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.href, `https://api.github.com/repos/reader/private-assets/contents/${key}?ref=main`);
    assert.equal(init.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(init.headers.get('user-agent'), 'pojok-baca-worker');
    assert.equal(init.headers.get('x-github-api-version'), '2022-11-28');
    assert.equal(init.redirect, 'manual');
    if (init.headers.get('accept') === 'application/vnd.github.raw+json') return new Response(image);
    return Response.json({ type: 'file', size: image.length, sha: 'fixture-sha' });
  });
  const storage = createGitHubStorage(githubFixture);
  assert.deepEqual(await storage.headObject(key), { size: 4, contentType: 'image/webp' });
  const object = await storage.getObjectStream(key);
  assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()), image);
  assert.equal(fetchMock.mock.callCount(), 4);
});

test('GitHub writes and deletes with the latest file SHA after 409', async t => {
  let state = 'v1';
  let writes = 0;
  let deletes = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (init.method === 'GET') return Response.json({ type: 'file', sha: state, size: 2 });
    const data = JSON.parse(init.body);
    assert.equal(data.branch, 'main');
    assert.equal(data.sha, state);
    if (init.method === 'PUT') {
      assert.equal(data.content, 'AAE=');
      state = `v${++writes + 1}`;
      if (writes === 1) return new Response(null, { status: 409 });
    } else {
      assert.equal(init.method, 'DELETE');
      state = `v${++deletes + 3}`;
      if (deletes === 1) return new Response(null, { status: 409 });
    }
    return Response.json({});
  });
  const storage = createGitHubStorage(githubFixture);
  await storage.putObject('sheets/test/b001.webp', new Uint8Array([0, 1]));
  assert.equal(await storage.putWebpIfAbsent('sheets/test/b001.webp', new Uint8Array([4, 5])), false);
  await storage.deleteObjects(['sheets/test/b001.webp']);
  assert.equal(writes, 2);
  assert.equal(deletes, 2);
});

test('GitHub cleanup resumes from existing paths without deleting the entire batch in one request', async t => {
  const paths = new Set(Array.from({ length: 10 }, (_, index) => `b${index}.webp`));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const part = url.pathname.split('/').at(-1);
    if (url.pathname.includes('/git/trees/')) {
      const tree = part === 'main' ? [{ path: 'sheets', type: 'tree', sha: 'sheets' }]
        : part === 'sheets' ? [{ path: 'edition', type: 'tree', sha: 'edition' }]
          : [...paths].map(path => ({ path, type: 'blob', sha: path }));
      return Response.json({ tree, truncated: false });
    }
    assert.ok(paths.has(part));
    if (init.method === 'DELETE') {
      assert.equal(JSON.parse(init.body).sha, part);
      paths.delete(part);
      return Response.json({});
    }
    return Response.json({ type: 'file', sha: part, size: 4 });
  });
  const storage = createGitHubStorage(githubFixture);
  const keys = [...paths].map(path => `sheets/edition/${path}`);
  assert.deepEqual(await storage.deleteObjects(keys), { remaining: 2 });
  assert.equal(await storage.deleteObjects(keys), undefined);
  assert.equal(paths.size, 0);
});

test('public artifact stages cover assets but excludes books and private data', async (t) => {
  const root = await fixture(t);
  const publicRoot = join(root, 'public');
  for (const folder of ['covers', 'sheets', 'data/pages', 'data/text', 'dl']) {
    await mkdir(join(publicRoot, folder), { recursive: true });
    await writeFile(join(publicRoot, folder, 'test.webp'), 'fixture');
  }
  for (const file of ['_headers', '_redirects', 'book-placeholder.svg', 'favicon.ico',
    'favicon.svg', 'manifest.json', 'robots.txt']) {
    await writeFile(join(publicRoot, file), 'fixture');
  }
  const store = createLocalStorage(stagePublicSite(root));
  assert.ok(await store.headObject('covers/test.webp'));
  for (const folder of ['sheets', 'data/pages', 'data/text', 'dl']) {
    assert.equal(await store.headObject(folder + '/test.webp'), null);
  }
});
