import { Client } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import { importCatalog, planCatalogImport } from './lib/import-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = await planCatalogImport(root);
const counts = {
  books: catalog.length,
  draft: catalog.filter((entry) => !entry.pages.length && !entry.paragraphs.length).length,
  pages: catalog.reduce((sum, entry) => sum + entry.pages.length, 0),
  paragraphs: catalog.reduce((sum, entry) => sum + entry.paragraphs.length, 0),
};
console.log('Katalog tervalidasi:', counts);

if (!process.argv.includes('--apply')) process.exit(0);

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('Isi DATABASE_URL_UNPOOLED untuk branch yang akan diimpor.');
const target = new URL(connectionString);
if (target.hostname.split('.')[0].endsWith('-pooler')) {
  throw new Error('Impor memakai koneksi direct.');
}
// Explicit host selection protects against applying with the wrong environment file.
if (process.env.PB_IMPORT_HOST !== target.hostname) {
  throw new Error('PB_IMPORT_HOST harus sama dengan host branch yang akan diimpor.');
}

const client = new Client({ connectionString });
await client.connect();
try {
  const result = await importCatalog(catalog, async (run) => {
    await client.query('BEGIN');
    try {
      const value = await run((text, params) => client.query(text, params));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  console.log('Impor selesai:', result);
} finally {
  await client.end();
}
