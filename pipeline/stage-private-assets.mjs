import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, '.data', 'private-storage');
await mkdir(target, { recursive: true });
await cp(join(root, 'public', 'sheets'), join(target, 'sheets'), {
  recursive: true,
  force: false,
  filter: (name) => !name.endsWith('.tmp'),
});
console.log('Strip WebP lama tersedia di penyimpanan lokal privat.');
