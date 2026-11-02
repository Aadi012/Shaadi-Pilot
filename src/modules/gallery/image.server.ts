import 'server-only';
import sharp from 'sharp';
import { ApiError } from '@/lib/api/errors';
import { MAX_PHOTO_BYTES } from './contracts';
let active = 0;
export async function sanitizePhoto(bytes: Buffer, mime: string) {
  if (active >= 2)
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Photo processing is busy. Retry shortly.',
    });
  active++;
  try {
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error();
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: false,
    });
    const meta = await image.metadata();
    const format = (
      {
        'image/jpeg': 'jpeg',
        'image/png': 'png',
        'image/webp': 'webp',
      } as Record<string, string>
    )[mime];
    if (
      !format ||
      meta.format !== format ||
      !meta.width ||
      !meta.height ||
      (meta.pages ?? 1) > 1 ||
      meta.width * meta.height > 40_000_000 ||
      meta.width > 16000 ||
      meta.height > 16000
    )
      throw new Error();
    // Re-encoding fully decodes pixels and strips EXIF/GPS by default.
    const result = await image
      .rotate()
      .webp({ quality: 90 })
      .timeout({ seconds: 20 })
      .toBuffer({ resolveWithObject: true });
    if (!result.data.length || result.data.length > MAX_PHOTO_BYTES)
      throw new Error();
    return {
      bytes: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      status: 422,
      code: 'INVALID_PHOTO',
      message:
        'This file could not be validated. Use a non-animated JPEG, PNG or WebP up to 20 MiB and 40 megapixels.',
    });
  } finally {
    active--;
  }
}
