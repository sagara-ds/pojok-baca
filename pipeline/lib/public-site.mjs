import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const publicFiles = [
  '_headers', '_redirects', 'book-placeholder.svg', 'favicon.ico',
  'favicon.svg', 'manifest.json', 'robots.txt',
];

/** Pipeline output is an input to the site, not the site's static directory. */
export function stagePublicSite(root) {
  const work = join(root, '.astro');
  mkdirSync(work, { recursive: true });
  const staged = mkdtempSync(join(work, 'site-public-'));
  const source = join(root, 'public');
  for (const file of publicFiles) copyFileSync(join(source, file), join(staged, file));

  const covers = join(source, 'covers');
  const entries = readdirSync(covers, { withFileTypes: true, throwIfNoEntry: false });
  if (entries) {
    mkdirSync(join(staged, 'covers'));
    for (const entry of entries) {
      if (entry.isFile() && /^[a-z0-9-]+\.webp$/.test(entry.name)) {
        copyFileSync(join(covers, entry.name), join(staged, 'covers', entry.name));
      }
    }
  }
  const pdfjs = join(root, 'node_modules', 'pdfjs-dist');
  for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const files = join(pdfjs, dir);
    if (existsSync(files)) cpSync(files, join(staged, 'pdfjs', dir), { recursive: true });
  }
  return staged;
}
