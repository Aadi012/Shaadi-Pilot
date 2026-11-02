import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { sanitizePhoto } from '@/modules/gallery/image.server';
import { uploadInput, MAX_PHOTO_BYTES } from '@/modules/gallery/contracts';
import { galleryLimits } from '@/modules/gallery/config.server';
import { photoStorage } from '@/modules/gallery/storage.server';
vi.mock('server-only', () => ({}));
describe('Gallery image and storage contracts', () => {
  it('fully decodes and re-encodes photographs with correct orientation and no EXIF metadata', async () => {
    const source = await sharp({
      create: { width: 2, height: 3, channels: 3, background: '#aabbcc' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await sanitizePhoto(source, 'image/jpeg');
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(3);
    expect(metadata.height).toBe(2);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
  it('rejects spoofed types, damaged data, empty input and unsupported decoded formats', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    for (const [bytes, mime] of [
      [png, 'image/jpeg'],
      [Buffer.from('<svg></svg>'), 'image/png'],
      [Buffer.alloc(0), 'image/png'],
      [png.subarray(0, 25), 'image/png'],
    ] as const)
      await expect(sanitizePhoto(bytes, mime)).rejects.toMatchObject({
        code: 'INVALID_PHOTO',
      });
  });
  it('strictly validates size, file name, event reference and caller fields', () => {
    expect(
      uploadInput.parse({
        fileName: 'Wedding.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: MAX_PHOTO_BYTES,
      }).sizeBytes,
    ).toBe(MAX_PHOTO_BYTES);
    for (const change of [
      { sizeBytes: MAX_PHOTO_BYTES + 1 },
      { sizeBytes: 1.5 },
      { mimeType: 'image/svg+xml' },
      { fileName: '../secret.jpg' },
      { weddingId: 'invented' },
      { objectKey: 'public/photo' },
    ])
      expect(
        uploadInput.safeParse({
          fileName: 'image.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          ...change,
        }).success,
      ).toBe(false);
  });
  it('defaults to approved pilot quotas and rejects unsafe configuration', () => {
    vi.stubEnv('GALLERY_MAX_PHOTOS', '1000');
    vi.stubEnv('GALLERY_MAX_BYTES', String(5 * 1024 ** 3));
    try {
      expect(galleryLimits()).toEqual({ count: 1000, bytes: 5 * 1024 ** 3 });
      vi.stubEnv('GALLERY_MAX_BYTES', 'NaN');
      expect(() => galleryLimits()).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('signs private operations without contacting a bucket and fails closed without credentials', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'a'.repeat(32));
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
    vi.stubEnv('R2_BUCKET', 'private-test-bucket');
    try {
      const url = new URL(
        await photoStorage.uploadUrl(
          'weddings/test/staging/random',
          'image/jpeg',
          120,
          100,
        ),
      );
      expect(url.hostname).toBe('a'.repeat(32) + '.r2.cloudflarestorage.com');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
        'content-length',
      );
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
        'content-type',
      );
      const view = new URL(
        await photoStorage.viewUrl('weddings/test/photos/immutable.webp'),
      );
      expect(view.searchParams.get('X-Amz-Expires')).toBe('60');
      vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
      expect(photoStorage.configured()).toBe(false);
      await expect(photoStorage.viewUrl('anything')).rejects.toMatchObject({
        status: 503,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
