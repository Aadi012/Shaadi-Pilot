import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';

export const discoveryCategories = [
  'Photographer',
  'Caterer',
  'Wedding venue',
  'Florist',
  'Makeup artist',
  'DJ',
] as const;
export const placeIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);
export const discoveryInput = z
  .strictObject({
    category: z.enum(discoveryCategories),
    locationSource: z.enum(['wedding', 'function', 'custom']),
    eventId: objectIdSchema.optional(),
    location: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      (v.locationSource === 'function') !== !!v.eventId ||
      (v.locationSource === 'custom') !== !!v.location
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Choose the matching location source and details.',
      });
  });
export const savePlaceInput = z.strictObject({
  googlePlaceId: placeIdSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Enter your own label for this vendor.')
    .max(160),
  category: z.enum(discoveryCategories),
  notes: z.string().trim().max(2000).default(''),
});
export type DiscoveryInput = z.infer<typeof discoveryInput>;
export type SavePlaceInput = z.infer<typeof savePlaceInput>;
export type GooglePlace = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  phone: string;
  website: string;
  mapsUrl: string;
  attributions: { name: string; url: string }[];
};
export type DiscoveryResult = {
  weddingId: string;
  location: string;
  places: (GooglePlace & { savedVendorId: string | null })[];
};
