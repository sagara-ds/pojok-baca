export interface ObjectInfo {
  size: number;
  contentType?: string;
}

export interface StoredObject extends ObjectInfo {
  body: ReadableStream<Uint8Array>;
}

export interface PrivateStorage {
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  putWebpIfAbsent(key: string, body: Uint8Array): Promise<boolean>;
  getPresignedPutUrl?(key: string, signedAt: Date): Promise<{ url: string; headers: Record<string, string> }>;
  headObject(key: string): Promise<ObjectInfo | null>;
  getObjectStream(key: string): Promise<StoredObject | null>;
  deleteObjects(keys: string[]): Promise<void | { remaining: number }>;
}

export const immutableWebpCache = 'public, max-age=31536000, immutable';

export function checkObjectKey(key: string): string[] {
  const parts = key.split('/');
  if (key.length > 1024 || parts.some((part) =>
    !/^[a-z0-9][a-z0-9_.-]*$/i.test(part) || part.endsWith('.')
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Invalid private storage key');
  }
  return parts;
}
