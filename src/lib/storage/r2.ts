import { checkObjectKey, immutableWebpCache, type PrivateStorage } from './types';

interface R2Object {
  size: number;
  httpMetadata?: { contentType?: string };
}
interface PrivateBucket {
  put(key: string, value: Uint8Array, options: {
    httpMetadata: { contentType?: string; cacheControl?: string };
    onlyIf?: Headers;
  }): Promise<unknown>;
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<(R2Object & { body: ReadableStream<Uint8Array> }) | null>;
  delete(keys: string[]): Promise<void>;
}

export function createR2Storage(bucket: PrivateBucket): PrivateStorage {
  return {
    async putObject(key, body, contentType) {
      checkObjectKey(key);
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async putWebpIfAbsent(key, body) {
      checkObjectKey(key);
      return Boolean(await bucket.put(key, body, {
        httpMetadata: { contentType: 'image/webp', cacheControl: immutableWebpCache },
        onlyIf: new Headers({ 'If-None-Match': '*' }),
      }));
    },
    async headObject(key) {
      checkObjectKey(key);
      const object = await bucket.head(key);
      return object && { size: object.size, contentType: object.httpMetadata?.contentType };
    },
    async getObjectStream(key) {
      checkObjectKey(key);
      const object = await bucket.get(key);
      return object && { size: object.size, contentType: object.httpMetadata?.contentType, body: object.body };
    },
    async deleteObjects(keys) {
      keys.forEach(checkObjectKey);
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    },
  };
}
