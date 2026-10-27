import { z } from 'zod';
export const slugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const createWeddingSchema = z.strictObject({
  displayNames: z.strictObject({
    partnerOne: z.string().trim().min(1).max(100),
    partnerTwo: z.string().trim().min(1).max(100),
    intro: z.string().trim().max(200).default(''),
  }),
  weddingDate: z.iso.date(),
  location: z.string().trim().min(1).max(160),
  timezone: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  slug: slugSchema,
});
export const idempotencySchema = z.uuid();
export const editWeddingSchema = createWeddingSchema.omit({ slug: true });
export type EditWeddingInput = z.infer<typeof editWeddingSchema>;
export type CreateWeddingInput = z.infer<typeof createWeddingSchema>;
export type WeddingDto = {
  id: string;
  displayNames: CreateWeddingInput['displayNames'];
  weddingDate: string;
  location: string;
  timezone: string;
  slug: string;
  isPublished: boolean;
  version: number;
};
