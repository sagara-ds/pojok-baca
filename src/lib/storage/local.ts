import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { checkObjectKey, type PrivateStorage, type StoredObject } from './types.ts';

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function contentType(key: string) {
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.json')) return 'application/json';
  if (key.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

export function createLocalStorage(root = resolve('.data/private-storage')): PrivateStorage {
  async function objectPath(key: string, create = false) {
    const parts = checkObjectKey(key);
    if (create) await mkdir(root, { recursive: true });
    let parent = await realpath(root);
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (create) {
        await mkdir(parent).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        });
      }
      const entry = await lstat(parent);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error('Invalid private storage directory');
      }
    }
    return join(parent, parts.at(-1)!);
  }

  async function inspect(key: string) {
    const path = await objectPath(key);
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('Invalid private storage object');
    return { path, size: file.size, contentType: contentType(key) };
  }

  async function write(key: string, bytes: Uint8Array, ifAbsent: boolean) {
    const path = await objectPath(key, true);
    const temp = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
      if (ifAbsent) await link(temp, path);
      else await rename(temp, path);
      return true;
    } catch (error) {
      if (ifAbsent && (error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  }

  return {
    async putObject(key, body) { await write(key, body, false); },
    putWebpIfAbsent: (key, body) => write(key, body, true),
    async headObject(key) {
      try {
        const { size, contentType } = await inspect(key);
        return { size, contentType };
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async getObjectStream(key) {
      try {
        const { path, size, contentType } = await inspect(key);
        const handle = await open(path, 'r');
        try {
          // Node emits a Web Stream of bytes. Its stream types differ from the DOM declarations.
          const body = handle.readableWebStream({ autoClose: true }) as unknown as StoredObject['body'];
          return { size, contentType, body };
        } catch (error) {
          await handle.close();
          throw error;
        }
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async deleteObjects(keys) {
      keys.forEach(checkObjectKey);
      for (const key of new Set(keys)) {
        try {
          await rm(await objectPath(key), { force: true });
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
    },
  };
}
