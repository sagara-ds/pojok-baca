import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, link, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkObjectKey } from '../src/lib/storage/types.ts';
import { planCatalogImport } from './lib/import-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, '.cache', 'github-assets');
const source = join(root, '.data', 'private-storage');
const repository = 'sagara-ds/pojok-baca-assets';
const branch = 'main';
const remote = `https://github.com/${repository}.git`;
const chunkLimit = 384 * 1024 * 1024;
const noPrompt = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
const [mode, ...extra] = process.argv.slice(2);
assert.ok(!extra.length && (!mode || mode === '--apply'), 'Only --apply is supported.');

async function plan() {
  const catalog = await planCatalogImport(root);
  const keys = [...new Set(catalog.flatMap(({ pages }) => pages.map(page => page.asset_key)))].sort();
  const files = [];
  for (let offset = 0; offset < keys.length; offset += 64) {
    files.push(...await Promise.all(keys.slice(offset, offset + 64).map(async key => {
      assert.ok(key.startsWith('sheets/') && key.endsWith('.webp'));
      const local = join(source, ...checkObjectKey(key));
      const file = await stat(local);
      assert.ok(file.isFile() && file.size > 0 && file.size < 100 * 1024 * 1024, `Invalid strip: ${key}`);
      return { key, local, size: file.size };
    })));
  }
  assert.ok(files.length);
  return files;
}

async function authenticate() {
  let token = process.env.GITHUB_STORAGE_TOKEN;
  if (!token) {
    const credential = spawnSync('git', ['credential', 'fill'], {
      input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`,
      encoding: 'utf8', env: noPrompt, windowsHide: true,
    });
    token = credential.stdout?.match(/^password=(.+)$/mu)?.[1]?.trim();
  }
  assert.ok(token, 'A working GitHub credential is required.');
  const response = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'pojok-baca-worker', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub repository check failed (HTTP ${response.status}).`);
  const repo = await response.json();
  assert.ok(repo.full_name === repository && repo.private === true && repo.default_branch === branch,
    'Refusing to upload outside the expected private repository and branch.');
  return {
    ...noPrompt,
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    GIT_CONFIG_KEY_2: 'pack.threads', GIT_CONFIG_VALUE_2: '2',
  };
}

async function migrate(files) {
  const env = await authenticate();
  const git = (args, options) => execFileSync('git', args, { cwd: destination, env, windowsHide: true, ...options });
  await mkdir(destination, { recursive: true });
  if (!(await stat(join(destination, '.git')).catch(() => null))) {
    git(['clone', '--no-tags', '--single-branch', '--branch', branch, remote, '.'], { stdio: 'inherit' });
  }
  const gitText = args => git(args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  assert.equal(gitText(['remote', 'get-url', 'origin']), remote);
  assert.equal(gitText(['branch', '--show-current']), branch);
  git(['fetch', '--no-tags', 'origin', branch], { stdio: 'inherit' });
  git(['merge', '--ff-only', 'origin/main'], { stdio: 'inherit' });
  const tracked = new Set(gitText(['ls-tree', '-rz', '--name-only', 'HEAD', '--', 'sheets/']).split('\0'));
  let remaining = files.filter(({ key }) => !tracked.has(key));
  console.log(`File yang sudah ada: ${files.length - remaining.length}/${files.length}.`);

  const push = () => git(['push', 'origin', 'HEAD:refs/heads/main'], { stdio: 'inherit' });
  if (gitText(['rev-parse', 'HEAD']) !== gitText(['rev-parse', 'origin/main'])) push();
  while (remaining.length) {
    let limit = 0;
    let bytes = 0;
    do { bytes += remaining[limit++].size; }
    while (limit < remaining.length && bytes + remaining[limit].size <= chunkLimit);
    const batch = remaining.slice(0, limit);
    for (const file of batch) {
      const target = join(destination, ...checkObjectKey(file.key));
      await mkdir(dirname(target), { recursive: true });
      try { await link(file.local, target); }
      catch (error) {
        if (error.code !== 'EEXIST') await copyFile(file.local, target);
        else assert.equal((await stat(target)).size, file.size, `Existing file differs: ${file.key}`);
      }
    }
    git(['add', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input: batch.map(file => file.key).join('\0') + '\0', stdio: ['pipe', 'inherit', 'inherit'],
    });
    git(['-c', 'user.name=Pojok Baca', '-c', 'user.email=234320373+sagara-ds@users.noreply.github.com',
      'commit', '--quiet', '-m', `Import library strips ${files.length - remaining.length + 1}–${files.length - remaining.length + limit}`],
    { stdio: 'inherit' });
    push();
    remaining = remaining.slice(limit);
    console.log(`Aset terunggah: ${files.length - remaining.length}/${files.length}.`);
  }
  const published = gitText(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/u)[0];
  assert.equal(gitText(['rev-parse', 'HEAD']), published, 'Remote branch differs from the verified local commit.');
  const remoteKeys = new Set(gitText(['ls-tree', '-rz', '--name-only', published, '--', 'sheets/']).split('\0'));
  assert.ok(files.every(({ key }) => remoteKeys.has(key)), 'Remote commit lacks a catalog asset.');
  console.log(`Terverifikasi: ${files.length} key aset di branch main.`);
}

try {
  const files = await plan();
  console.log('Rencana migrasi:', { objects: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) });
  if (mode === '--apply') await migrate(files);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migrasi aset gagal.');
  process.exitCode = 1;
}
