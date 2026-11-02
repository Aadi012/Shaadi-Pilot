import 'server-only';
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from '@/lib/api/errors';
import { storageConfig } from './config.server';
export interface PhotoStorage {
  configured(): boolean;
  uploadUrl(
    key: string,
    mime: string,
    expiresIn: number,
    sizeBytes: number,
  ): Promise<string>;
  read(key: string, maxBytes: number): Promise<Buffer>;
  put(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  viewUrl(key: string): Promise<string>;
}
function client() {
  const config = storageConfig();
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: 'auto',
      forcePathStyle: true,
      endpoint: 'https://' + config.account + '.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: config.access,
        secretAccessKey: config.secret,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
    }),
  };
}
async function provider<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      status: 503,
      code: 'PROVIDER_FAILURE',
      message:
        'Photo storage could not complete this operation. Retry shortly.',
    });
  }
}
export const photoStorage: PhotoStorage = {
  configured() {
    try {
      storageConfig();
      return true;
    } catch {
      return false;
    }
  },
  uploadUrl: async (key, mime, expiresIn, sizeBytes) =>
    provider(async () => {
      const c = client();
      return getSignedUrl(
        c.client,
        new PutObjectCommand({
          Bucket: c.bucket,
          Key: key,
          ContentType: mime,
          ContentLength: sizeBytes,
        }),
        {
          expiresIn,
          signableHeaders: new Set(['content-length', 'content-type']),
        },
      );
    }),
  read: async (key, maxBytes) =>
    provider(async () => {
      const c = client();
      const response = await c.client.send(
        new GetObjectCommand({ Bucket: c.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      if (
        !response.Body ||
        !response.ContentLength ||
        response.ContentLength > maxBytes
      ) {
        if (response.Body instanceof Readable) response.Body.destroy();
        throw new ApiError({
          status: 422,
          code: 'INVALID_PHOTO',
          message:
            'The uploaded file is missing or exceeds its permitted size.',
        });
      }
      const parts: Buffer[] = [];
      let total = 0;
      for await (const part of response.Body as AsyncIterable<Uint8Array>) {
        total += part.length;
        if (total > maxBytes)
          throw new ApiError({
            status: 413,
            code: 'FILE_TOO_LARGE',
            message: 'Photo exceeds the permitted size.',
          });
        parts.push(Buffer.from(part));
      }
      return Buffer.concat(parts);
    }),
  put: async (key, bytes) =>
    provider(async () => {
      const c = client();
      await c.client.send(
        new PutObjectCommand({
          Bucket: c.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/webp',
          CacheControl: 'private, no-store',
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    }),
  remove: async (key) =>
    provider(async () => {
      const c = client();
      await c.client.send(
        new DeleteObjectCommand({ Bucket: c.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    }),
  viewUrl: async (key) =>
    provider(async () => {
      const c = client();
      return getSignedUrl(
        c.client,
        new GetObjectCommand({
          Bucket: c.bucket,
          Key: key,
          ResponseContentType: 'image/webp',
          ResponseCacheControl: 'private, no-store',
          ResponseContentDisposition: 'inline; filename="wedding-photo.webp"',
        }),
        { expiresIn: 60 },
      );
    }),
};
