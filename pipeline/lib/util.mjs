import fs from 'node:fs/promises';
import path from 'node:path';

export const log = {
  info(...args) {
    console.log(...args);
  },
  step(msg) {
    console.log(`\n\x1b[36m▸ ${msg}\x1b[0m`);
  },
  ok(msg) {
    console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
  },
  warn(msg) {
    console.log(`\x1b[33m  ! ${msg}\x1b[0m`);
  },
  err(msg) {
    console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);
  },
  dim(msg) {
    console.log(`\x1b[90m    ${msg}\x1b[0m`);
  },
};

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Tulis JSON secara atomik (tulis tmp lalu rename) supaya file tidak korup kalau proses mati di tengah. */
export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#039': "'",
};

export function decodeEntities(input) {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Ambil sebagian argumen CLI: --key value / --flag / --key=value */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[body] = argv[++i];
    } else {
      out[body] = true;
    }
  }
  return out;
}
