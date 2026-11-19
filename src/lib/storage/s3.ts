import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand,
  PutObjectCommand, S3Client, S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkObjectKey, immutableWebpCache, type PrivateStorage } from './types.ts';

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function absent(error: unknown) {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

export function createS3Storage(config: S3Config): PrivateStorage {
  const Bucket = config.bucket;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const webpHeaders = {
    'Content-Type': 'image/webp',
    'Cache-Control': immutableWebpCache,
    'If-None-Match': '*',
  };
  const webpCommand = (Key: string, Body?: Uint8Array) => new PutObjectCommand({
    Bucket, Key, Body, ContentType: webpHeaders['Content-Type'],
    CacheControl: webpHeaders['Cache-Control'], IfNoneMatch: webpHeaders['If-None-Match'],
  });
  return {
    async putObject(Key, Body, ContentType) {
      checkObjectKey(Key);
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    async putWebpIfAbsent(Key, Body) {
      checkObjectKey(Key);
      try {
        await client.send(webpCommand(Key, Body));
        return true;
      } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) return false;
        throw error;
      }
    },
    async getPresignedPutUrl(Key, signedAt) {
      checkObjectKey(Key);
      const url = await getSignedUrl(client, webpCommand(Key), {
        expiresIn: 60,
        signingDate: signedAt,
        signableHeaders: new Set(Object.keys(webpHeaders).map((header) => header.toLowerCase())),
      });
      return { url, headers: { ...webpHeaders } };
    },
    async headObject(Key) {
      checkObjectKey(Key);
      try {
        const response = await client.send(new HeadObjectCommand({ Bucket, Key }));
        if (response.ContentLength === undefined) throw new Error('Storage response is missing object size');
        return { size: response.ContentLength, contentType: response.ContentType };
      } catch (error) {
        if (absent(error)) return null;
        throw error;
      }
    },
    async getObjectStream(Key) {
      checkObjectKey(Key);
      try {
        const response = await client.send(new GetObjectCommand({ Bucket, Key }));
        if (response.ContentLength === undefined || !response.Body) throw new Error('Invalid storage response');
        return {
          size: response.ContentLength,
          contentType: response.ContentType,
          body: response.Body.transformToWebStream(),
        };
      } catch (error) {
        if (absent(error)) return null;
        throw error;
      }
    },
    async deleteObjects(keys) {
      keys.forEach(checkObjectKey);
      const unique = [...new Set(keys)];
      for (let i = 0; i < unique.length; i += 1000) {
        const response = await client.send(new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: unique.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }));
        if (response.Errors?.length) throw new Error('Storage could not delete every object');
      }
    },
  };
}
