import { z } from 'zod';

const website = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, 'Enter a full http:// or https:// website address without credentials.');
const fields = {
  name: z.string().trim().min(1, 'Enter the vendor name.').max(160),
  category: z.string().trim().min(1, 'Enter a category.').max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+0-9().\-\s]*$/, 'Enter a valid phone number.'),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (v) => !v || z.email().safeParse(v).success,
      'Enter a valid email address.',
    )
    .transform((v) => v.toLowerCase()),
  website,
  address: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
};
export const vendorInput = z.strictObject({
  ...fields,
  phone: fields.phone.default(''),
  email: fields.email.default(''),
  website: fields.website.default(''),
  address: fields.address.default(''),
  notes: fields.notes.default(''),
});
export const vendorPatch = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide a field to update.');
export const vendorQuery = z.strictObject({
  search: z.string().trim().max(160).default(''),
  category: z.string().trim().max(80).default(''),
  cursor: z.string().max(200).optional(),
});
export type VendorInput = z.infer<typeof vendorInput>;
export type VendorQuery = z.infer<typeof vendorQuery>;
export type VendorDto = VendorInput & {
  id: string;
  version: number;
  source: 'manual';
};
export type VendorPage = {
  weddingId: string;
  vendors: VendorDto[];
  total: number;
  nextCursor: string | null;
};
