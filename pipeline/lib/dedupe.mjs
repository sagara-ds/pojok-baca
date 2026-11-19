import { config } from '../config.mjs';
import { hammingDistance } from './image.mjs';

/**
 * Kelompokkan file yang isinya buku sama.
 *
 * Sinyal yang dipakai:
 *  1. sha256 identik            → salinan persis.
 *  2. dHash cover sama + jumlah halaman sama → scan berbeda dari buku yang sama.
 *  3. judul + penulis sama + jumlah halaman hampir sama → judul sama,/edisi beda.
 *
 * Sinyal 3 sengaja tidak memakai judul saja: "A Man Called Ove" versi Inggris dan
 * versi Indonesia punya judul sama tapi berbeda buku.
 */

function samePageCount(a, b, tolerance) {
  if (!a || !b) return false;
  const max = Math.max(a, b);
  if (max === 0) return false;
  return Math.abs(a - b) / max <= tolerance;
}

export function groupDuplicates(entries, { pageTolerance = config.dedupePageTolerance } = {}) {
  const parent = new Map(entries.map((e) => [e.id, e.id]));

  function find(x) {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  const bySha = new Map();
  const byHash = new Map();
  const byTitle = new Map();

  for (const entry of entries) {
    if (entry.sha256) {
      const key = `sha:${entry.sha256}`;
      if (bySha.has(key)) union(bySha.get(key), entry.id);
      else bySha.set(key, entry.id);
    }

    if (entry.dhash && entry.pages) {
      const key = `dh:${entry.dhash}:${entry.pages}`;
      if (byHash.has(key)) union(byHash.get(key), entry.id);
      else byHash.set(key, entry.id);
    }

    if (entry.titleKey && entry.authorKey) {
      const key = `ta:${entry.titleKey}|${entry.authorKey}`;
      const previous = byTitle.get(key);
      if (previous && samePageCount(previous.pages, entry.pages, pageTolerance)) {
        union(previous.id, entry.id);
      }
      byTitle.set(key, entry);
    }
  }

  // Kelompokkan.
  const groups = new Map();
  for (const entry of entries) {
    const root = find(entry.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  }

  const result = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      result.push({ representative: members[0].id, members, duplicates: [] });
      continue;
    }
    // Pilih yang paling lengkap: paling banyak halaman, lalu file terbesar.
    const sorted = [...members].sort(
      (a, b) => (b.pages ?? 0) - (a.pages ?? 0) || (b.bytes ?? 0) - (a.bytes ?? 0),
    );
    const representative = sorted[0];
    const duplicates = sorted.slice(1).map((m) => ({
      id: m.id,
      name: m.name,
      pages: m.pages,
      bytes: m.bytes,
      reason: describeReason(representative, m),
    }));
    result.push({ representative: representative.id, members: sorted, duplicates });
  }

  return result;
}

function describeReason(a, b) {
  if (a.sha256 && a.sha256 === b.sha256) return 'sha256 identik';
  if (a.dhash && b.dhash && a.dhash === b.dhash) return 'cover identik (dHash)';
  if (a.titleKey && a.titleKey === b.titleKey && a.authorKey === a.authorKey) {
    return 'judul + penulis sama';
  }
  return 'kemiripan halaman awal';
}

/** Cover yang mirip tapi tidak identik (dHash jarak kecil). */
export function nearCoverMatch(a, b, maxDistance = 6) {
  if (!a?.dhash || !b?.dhash) return false;
  return hammingDistance(a.dhash, b.dhash) <= maxDistance;
}
