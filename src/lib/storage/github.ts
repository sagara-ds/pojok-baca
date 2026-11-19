import { Buffer } from 'node:buffer';
import { checkObjectKey, type PrivateStorage } from './types.ts';

interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

class GitHubStorageError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`GitHub Storage returned HTTP ${status}`);
    this.name = 'GitHubStorageError';
    this.status = status;
  }
}

async function retryConflict<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof GitHubStorageError) || error.status !== 409 || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
}

export function createGitHubStorage(config: GitHubStorageConfig): PrivateStorage {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  async function call(url: URL, method: string, accept: string, data?: object) {
    const headers = new Headers({
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'pojok-baca-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      Accept: accept,
    });
    if (data) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { method, headers, body: data && JSON.stringify(data), redirect: 'manual' });
    if (response.ok) return response;
    await response.body?.cancel();
    if (response.status === 404) return null;
    throw new GitHubStorageError(response.status);
  }

  function request(key: string, method = 'GET', accept = 'application/vnd.github.object+json', data?: object) {
    const path = checkObjectKey(key).map(encodeURIComponent).join('/');
    const url = new URL(`${base}/contents/${path}`);
    if (method === 'GET') url.searchParams.set('ref', config.branch);
    return call(url, method, accept, data);
  }

  async function existingKeys(keys: string[]) {
    interface TreeEntry { path: string; type: 'tree' | 'blob'; sha: string }
    const trees = new Map<string, Map<string, TreeEntry>>();
    async function getTree(ref: string) {
      const cached = trees.get(ref);
      if (cached) return cached;
      const response = await call(new URL(`${base}/git/trees/${encodeURIComponent(ref)}`), 'GET', 'application/vnd.github+json');
      if (!response) throw new GitHubStorageError(404);
      const { tree, truncated } = await response.json() as { tree: TreeEntry[]; truncated: boolean };
      if (truncated || !Array.isArray(tree)) throw new Error('Incomplete GitHub Storage tree');
      const entries = new Map(tree.map(entry => [entry.path, entry]));
      trees.set(ref, entries);
      return entries;
    }
    const found: string[] = [];
    for (const key of keys) {
      const parts = checkObjectKey(key);
      const file = parts.pop()!;
      let tree: Map<string, TreeEntry> | undefined = await getTree(config.branch);
      for (const part of parts) {
        const directory: TreeEntry | undefined = tree?.get(part);
        if (directory?.type !== 'tree') { tree = undefined; break; }
        tree = await getTree(directory.sha);
      }
      if (tree?.get(file)?.type === 'blob') found.push(key);
    }
    return found;
  }

  async function metadata(key: string) {
    const response = await request(key);
    if (!response) return null;
    const { type, sha, size } = await response.json() as { type?: string; sha?: string; size?: number };
    if (type !== 'file' || !sha || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('Invalid GitHub Storage file metadata');
    }
    return { sha, size };
  }

  async function raw(key: string) {
    const response = await request(key, 'GET', 'application/vnd.github.raw+json');
    if (!response) return null;
    const length = response.headers.get('content-length');
    const encoding = response.headers.get('content-encoding');
    const candidate = length !== null && (!encoding || encoding === 'identity') ? Number(length) : NaN;
    const contentType = key.endsWith('.webp') ? 'image/webp' : response.headers.get('content-type') ?? undefined;
    try {
      const size = Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : (await metadata(key))?.size;
      if (size === undefined || !response.body) throw new Error('Invalid GitHub Storage raw response');
      return { size, contentType, body: response.body };
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
  }

  async function write(key: string, bytes: Uint8Array, onlyIfAbsent: boolean) {
    const content = Buffer.from(bytes).toString('base64');
    return retryConflict(async () => {
      const previous = await metadata(key);
      if (onlyIfAbsent && previous) return false;
      const data = {
        message: `Store ${key}`, branch: config.branch, content,
        ...(previous ? { sha: previous.sha } : {}),
      };
      try {
        const response = await request(key, 'PUT', undefined, data);
        if (!response) throw new GitHubStorageError(404);
        await response.body?.cancel();
        return true;
      } catch (error) {
        // A concurrent create can require a SHA after the initial metadata lookup.
        if (!previous && error instanceof GitHubStorageError && error.status === 422 && await metadata(key)) {
          if (onlyIfAbsent) return false;
          throw new GitHubStorageError(409);
        }
        throw error;
      }
    });
  }

  return {
    async putObject(key, bytes) { await write(key, bytes, false); },
    async putWebpIfAbsent(key, bytes) { return write(key, bytes, true); },
    async headObject(key) {
      const object = await raw(key);
      if (!object) return null;
      await object.body.cancel();
      return { size: object.size, contentType: object.contentType };
    },
    getObjectStream: raw,
    async deleteObjects(keys) {
      keys.forEach(checkObjectKey);
      const unique = [...new Set(keys)];
      // A single cleanup request must fit the Workers Free subrequest budget.
      const found = unique.length > 8 ? await existingKeys(unique) : unique;
      for (const key of found.slice(0, 8)) {
        await retryConflict(async () => {
          const existing = await metadata(key);
          if (!existing) return;
          const response = await request(key, 'DELETE', undefined, {
            message: `Remove ${key}`, branch: config.branch, sha: existing.sha,
          });
          await response?.body?.cancel();
        });
      }
      if (found.length > 8) return { remaining: found.length - 8 };
    },
  };
}
