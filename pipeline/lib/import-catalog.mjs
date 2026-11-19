import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isAdult } from '../../src/services/curation.ts';

async function json(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function loadPages(root, book) {
  const indexPath = `data/pages/${book.slug}.json`;
  const index = await json(join(root, 'public', indexPath));
  assert.equal(index.mode, 'sheets', indexPath);
  assert.equal(index.count, book.pages, indexPath);
  assert.ok(Number.isInteger(book.pages) && book.pages > 0, indexPath);
  const pages = [];
  for (const strip of index.strips) {
    assert.match(strip.file, /^b\d+\.webp$/, indexPath);
    const key = `sheets/${book.slug}/${strip.file}`;
    assert.ok((await stat(join(root, 'public', key))).isFile(), key);
    for (const [y, height] of strip.pages) {
      assert.ok(Number.isInteger(y) && y >= 0 && Number.isInteger(height) && height > 0, key);
      pages.push({ page_number: pages.length + 1, asset_key: key, crop_y: y, crop_height: height });
    }
  }
  assert.equal(pages.length, book.pages, indexPath);
  return pages;
}

async function loadText(root, book, pages) {
  const chapters = [];
  const paragraphs = [];
  if (!book.hasTextLayer) return { chapters, paragraphs };
  const path = join(root, 'public', 'data', 'text', `${book.slug}.json`);
  const data = await json(path);
  assert.equal(data.slug, book.slug, path);
  const sourceChapters = book.type === 'pdf'
    ? data.pages.map(({ n, text }) => {
        assert.ok(Number.isInteger(n) && pages[n - 1], path);
        pages[n - 1].extracted_text = text.trim() || null;
        return { title: `Halaman ${n}`, text };
      })
    : data.chapters;
  for (const chapter of sourceChapters) {
    const bodies = chapter.text.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
    if (!bodies.length) continue;
    const chapterIndex = chapters.length;
    chapters.push({ chapter_index: chapterIndex, title: chapter.title?.trim() || null });
    for (const body of bodies) paragraphs.push({
      paragraph_index: paragraphs.length, chapter_index: chapterIndex, body,
    });
  }
  assert.ok(paragraphs.length > 0, path);
  return { chapters, paragraphs };
}

export async function planCatalogImport(root) {
  const manifest = await json(join(root, 'data', 'books.json'));
  const seen = new Set();
  const catalog = [];
  for (const book of manifest.books) {
    assert.match(book.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(!seen.has(book.slug), `Slug ganda: ${book.slug}`);
    seen.add(book.slug);
    if (isAdult(book.slug)) continue;
    assert.ok(book.type === 'pdf' || book.type === 'epub', book.slug);
    const pages = book.type === 'pdf' ? await loadPages(root, book) : [];
    const text = await loadText(root, book, pages);
    catalog.push({ book, pages, ...text });
  }
  return catalog;
}

/** transaction runs the callback atomically with a parameterized query function. */
export async function importCatalog(catalog, transaction) {
  const summary = { published: 0, draft: 0, skipped: 0 };
  for (const { book, pages, chapters, paragraphs } of catalog) {
    const result = await transaction(async (query) => {
      const { rows: [inserted] } = await query(`
        INSERT INTO pojok_baca.books (slug, title, author, categories, synopsis, cover_url)
        VALUES ($1, $2, $3, $4::text[], $5, $6)
        ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [book.slug, book.title, book.author?.trim() || 'Tidak diketahui',
          book.categories ?? [], book.synopsis ?? '', book.hasCover ? book.cover : null]);
      if (!inserted) return 'skipped';
      if (pages.length === 0 && paragraphs.length === 0) return 'draft';

      const { rows: [edition] } = await query(`
        INSERT INTO pojok_baca.book_editions
          (book_id, book_type, total_pages, total_paragraphs, storage_kind, legacy_page_index_path)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [inserted.id, pages.length ? 'webp_sheets' : 'novel_text', pages.length,
          paragraphs.length, pages.length ? 'legacy_strips' : 'database',
          pages.length ? `/data/pages/${book.slug}.json` : null]);

      if (pages.length) await query(`
        INSERT INTO pojok_baca.book_pages (edition_id, page_number, asset_key, crop_y, crop_height, extracted_text)
        SELECT $1, page_number, asset_key, crop_y, crop_height, extracted_text
        FROM jsonb_to_recordset($2::jsonb)
          AS page(page_number integer, asset_key text, crop_y integer, crop_height integer, extracted_text text)`,
        [edition.id, JSON.stringify(pages)]);
      if (chapters.length) {
        await query(`
          INSERT INTO pojok_baca.novel_chapters (edition_id, chapter_index, title)
          SELECT $1, chapter_index, title FROM jsonb_to_recordset($2::jsonb)
            AS chapter(chapter_index integer, title text)`, [edition.id, JSON.stringify(chapters)]);
        await query(`
          INSERT INTO pojok_baca.novel_paragraphs (edition_id, paragraph_index, chapter_index, body)
          SELECT $1, paragraph_index, chapter_index, body FROM jsonb_to_recordset($2::jsonb)
            AS paragraph(paragraph_index integer, chapter_index integer, body text)`,
          [edition.id, JSON.stringify(paragraphs)]);
      }

      await query("UPDATE pojok_baca.book_editions SET state='ready' WHERE id=$1", [edition.id]);
      await query(`
        UPDATE pojok_baca.books
        SET current_edition_id=$1, status='published', updated_at=now() WHERE id=$2`,
        [edition.id, inserted.id]);
      return 'published';
    });
    summary[result]++;
  }
  return summary;
}
