import { unzipSync } from 'fflate';

/**
 * Parser EPUB minimal (EPUB 2 & 3).
 *
 * EPUB = zip berisi XHTML. Berbeda dengan PDF hasil scan, EPUB punya lapisan
 * teks asli: bisa dicari, disalin ukurannya, dan ukurannya jauh lebih kecil.
 * Di pipeline ini EPUB tidak dirender jadi gambar, tapi diekstrak supaya
 * reader bisa menyajikan teksnya langsung.
 */

const CONTAINER_PATH = 'META-INF/container.xml';

function parseXml(xml) {
  // Parser XML kecil berbasis regex. Cukup untuk OPF & container.xml,
  // yang strukturnya sederhana dan well-formed.
  const decode = (value) =>
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&amp;/g, '&');

  const tagValue = (xmlText, tag) => {
    const match = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return match ? decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : undefined;
  };

  const tagValues = (xmlText, tag) => {
    const out = [];
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
    for (const match of xmlText.matchAll(re)) {
      out.push(decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim());
    }
    return out;
  };

  return { tagValue, tagValues };
}

/**
 * @param {Buffer} buffer isi file .epub
 * @returns {{title?:string, author?:string, language?:string, chapters:{href:string,title:string}[], coverPath?:string, files:string[]}}
 */
export function parseEpub(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const names = Object.keys(files);
  const { tagValue, tagValues } = parseXml('');

  const containerRaw = files[CONTAINER_PATH];
  if (!containerRaw) {
    throw new Error('EPUB tidak valid: META-INF/container.xml tidak ada');
  }
  const containerXml = new TextDecoder().decode(containerRaw);
  const rootfile = containerXml.match(/full-path\s*=\s*"([^"]+)"/i)?.[1];
  if (!rootfile) throw new Error('EPUB tidak valid: rootfile tidak ditemukan');

  const opfRaw = files[rootfile];
  if (!opfRaw) throw new Error(`EPUB tidak valid: ${rootfile} tidak ada di zip`);
  const opfXml = new TextDecoder().decode(opfRaw);
  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';

  const metadataXml = opfXml.match(/<metadata[\s\S]*?<\/metadata>/i)?.[0] ?? opfXml;

  const title = tagValue(metadataXml, 'dc:title');
  const authors = tagValues(metadataXml, 'dc:creator');
  const language = tagValue(metadataXml, 'dc:language');

  // Manifest: id -> href
  const manifestXml = opfXml.match(/<manifest[\s\S]*?<\/manifest>/i)?.[0] ?? '';
  const manifest = new Map();
  for (const m of manifestXml.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const id = attrs.match(/id\s*=\s*"([^"]+)"/i)?.[1];
    const href = attrs.match(/href\s*=\s*"([^"]+)"/i)?.[1];
    const type = attrs.match(/media-type\s*=\s*"([^"]+)"/i)?.[1];
    const props = attrs.match(/properties\s*=\s*"([^"]+)"/i)?.[1] ?? '';
    if (id && href) manifest.set(id, { href: decodeURIComponent(href), type, props });
  }

  // Cover. <meta name="cover" content="..."> berada di section <metadata>,
  // bukan <manifest> -> harus dicari di seluruh OPF.
  const coverMeta =
    opfXml.match(/<meta[^>]*name\s*=\s*["']cover["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1] ??
    opfXml.match(/<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']cover["']/i)?.[1];
  const coverItemId = [...manifest.entries()].find(([, v]) => v.props.includes('cover-image'))?.[0];
  let coverPath = coverItemId ? opfDir + manifest.get(coverItemId).href : undefined;

  if (!coverPath && coverMeta) {
    const asItem = manifest.get(coverMeta);
    coverPath = asItem ? opfDir + asItem.href : opfDir + coverMeta;
    // Fallback: cari nama file persis di dalam zip.
    if (!names.includes(coverPath)) {
      const hit = names.find((n) => n.toLowerCase().endsWith('/' + coverMeta.toLowerCase()) || n.toLowerCase() === coverMeta.toLowerCase());
      if (hit) coverPath = hit;
    }
  }

  // Spine: urutan bab
  const spineXml = opfXml.match(/<spine[\s\S]*?<\/spine>/i)?.[0] ?? '';
  const chapters = [];
  for (const m of spineXml.matchAll(/<itemref\b([^>]*)\/?>/gi)) {
    const idref = m[1].match(/idref\s*=\s*"([^"]+)"/i)?.[1];
    const item = idref ? manifest.get(idref) : undefined;
    if (!item) continue;
    if (item.type && !/xhtml|html/i.test(item.type)) continue;
    chapters.push({ href: opfDir + item.href, title: '' });
  }

  // Judul bab diambil dari <title> di dalam XHTML.
  const decoder = new TextDecoder();
  for (const chapter of chapters) {
    const raw = files[chapter.href];
    if (!raw) continue;
    const html = decoder.decode(raw);
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (t) {
      chapter.title = t
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
    }
  }

  return {
    title,
    author: authors[0],
    language,
    chapters,
    coverPath,
    files: names,
  };
}

/** Ambil satu aset dari dalam EPUB (mis. file cover). */
export function extractEpubFile(buffer, path) {
  const files = unzipSync(new Uint8Array(buffer));
  const raw = files[path];
  if (!raw) return null;
  return Buffer.from(raw);
}
