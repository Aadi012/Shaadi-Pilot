import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const mimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const uploadInput = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((v) => !/[\x00-\x1f\x7f/\\]/.test(v), 'Use a simple file name.'),
  mimeType: z.enum(mimeTypes),
  sizeBytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
  eventId: objectIdSchema.optional(),
});
export type UploadInput = z.infer<typeof uploadInput>;
export type PhotoDto = {
  id: string;
  name: string;
  state:
    'pending' | 'processing' | 'ready' | 'rejected' | 'deleting' | 'deleted';
  sizeBytes: number;
  createdAt: string;
  version: number;
  width?: number;
  height?: number;
  eventId?: string;
  error?: string;
};
export type GalleryPage = {
  weddingId: string;
  photos: PhotoDto[];
  nextCursor: string | null;
  usage: { count: number; bytes: number; maxCount: number; maxBytes: number };
  storageReady: boolean;
};
