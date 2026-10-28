import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';
const fields = {
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter the primary guest name.')
    .max(160),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+0-9().\-\s]*$/, 'Enter a valid contact number.'),
  notes: z.string().trim().max(2000),
  selectedEventIds: z
    .array(objectIdSchema)
    .max(100)
    .refine(
      (v) => new Set(v).size === v.length,
      'Select each function only once.',
    )
    .transform((v) => [...v].sort()),
};
export const guestInput = z.strictObject({
  ...fields,
  phone: fields.phone.default(''),
  notes: fields.notes.default(''),
  selectedEventIds: fields.selectedEventIds.default([]),
});
export const guestPatch = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide a field to update.');
export const guestQuery = z.strictObject({
  search: z.string().trim().max(160).default(''),
  eventId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).optional(),
});
export type GuestInput = z.infer<typeof guestInput>;
export type GuestQuery = z.infer<typeof guestQuery>;
export type GuestDto = GuestInput & {
  id: string;
  version: number;
  duplicateEmail: boolean;
  selectedEvents: { id: string; title: string }[];
};
