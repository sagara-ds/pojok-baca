import type { APIRoute } from 'astro';
import { isAdmin } from '../../../server/auth';
import { getStatsEnv } from '../../../server/stats';
import { savePending } from '../../../server/catalog';

export const prerender = false;

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const POST: APIRoute = async ({ request, cookies, locals, url }) => {
  const env = getStatsEnv(locals);

  if (!isAdmin(cookies, env)) {
    return new Response(JSON.stringify({ error: 'Tidak berwenang' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const synopsis = String(form.get('synopsis') ?? '').trim();
  const categoriesRaw = String(form.get('categories') ?? '').trim();
  const file = form.get('file');

  if (!title) {
    return new Response(null, { status: 303, headers: { Location: '/admin/?error=title' } });
  }

  if (!(file instanceof File) || file.size === 0) {
    return new Response(null, { status: 303, headers: { Location: '/admin/?error=file' } });
  }

  if (file.size > MAX_BYTES) {
    return new Response(null, { status: 303, headers: { Location: '/admin/?error=size' } });
  }

  const slug = slugify(title);
  const categories = categoriesRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  let fileKey: string | undefined;
  let stored = 'manual';

  const r2 = env.PB_BOOKS as
    | { put(key: string, value: ArrayBuffer): Promise<unknown> }
    | undefined;

  if (r2) {
    fileKey = `source/${slug}.pdf`;
    await r2.put(fileKey, await file.arrayBuffer());
    stored = 'r2';
  }

  await savePending(
    env,
    {
      slug,
      title,
      author,
      synopsis,
      categories,
      fileKey,
      createdAt: new Date().toISOString(),
    },
  );

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/?uploaded=${encodeURIComponent(slug)}&stored=${stored}` },
  });
};
