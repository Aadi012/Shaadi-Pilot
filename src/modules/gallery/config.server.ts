import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
export function galleryLimits() {
  const values = z
    .object({
      count: z.coerce.number().int().min(1).max(100000).default(1000),
      bytes: z.coerce
        .number()
        .int()
        .min(20971520)
        .max(Number.MAX_SAFE_INTEGER)
        .default(5 * 1024 ** 3),
    })
    .safeParse({
      count: process.env.GALLERY_MAX_PHOTOS,
      bytes: process.env.GALLERY_MAX_BYTES,
    });
  if (!values.success)
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Gallery limits are not configured.',
    });
  return values.data;
}
export function storageConfig() {
  const result = z
    .object({
      account: z.string().regex(/^[a-f0-9]{32}$/),
      access: z.string().min(1),
      secret: z.string().min(1),
      bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
    })
    .safeParse({
      account: process.env.R2_ACCOUNT_ID,
      access: process.env.R2_ACCESS_KEY_ID,
      secret: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
    });
  if (!result.success)
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Private photo storage is not configured yet.',
    });
  return result.data;
}
export function storageConfigured() {
  try {
    storageConfig();
    return true;
  } catch {
    return false;
  }
}
