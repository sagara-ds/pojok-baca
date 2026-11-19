import { env } from 'cloudflare:workers';
import { serverSetting } from '../../server/database';
import type { PrivateStorage } from './types';

export type { PrivateStorage, StoredObject, ObjectInfo } from './types';

export function adminUploadConcurrency() {
  return env.STORAGE_DRIVER === 'github' ? 2 : 4;
}

export async function getStorage(): Promise<PrivateStorage> {
  const driver = env.STORAGE_DRIVER ?? (import.meta.env.DEV ? 'local' : undefined);
  if (driver === 'local' && import.meta.env.DEV) {
    const { createLocalStorage } = await import('./local');
    return createLocalStorage();
  }
  if (driver === 'github') {
    const { createGitHubStorage } = await import('./github');
    return createGitHubStorage({
      owner: serverSetting('GITHUB_STORAGE_OWNER'),
      repo: serverSetting('GITHUB_STORAGE_REPO'),
      branch: serverSetting('GITHUB_STORAGE_BRANCH'),
      token: serverSetting('GITHUB_STORAGE_TOKEN'),
    });
  }
  if (driver === 'r2' && env.PB_PRIVATE_FILES) {
    const { createR2Storage } = await import('./r2');
    return createR2Storage(env.PB_PRIVATE_FILES as Parameters<typeof createR2Storage>[0]);
  }
  if (driver === 's3') {
    const { createS3Storage } = await import('./s3');
    return createS3Storage({
      endpoint: serverSetting('STORAGE_S3_ENDPOINT'),
      region: typeof env.STORAGE_S3_REGION === 'string' ? env.STORAGE_S3_REGION : 'auto',
      bucket: serverSetting('STORAGE_S3_BUCKET'),
      accessKeyId: serverSetting('STORAGE_S3_ACCESS_KEY_ID'),
      secretAccessKey: serverSetting('STORAGE_S3_SECRET_ACCESS_KEY'),
    });
  }
  throw new Error('Private storage driver is unavailable');
}
