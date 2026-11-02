import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';
export const issueInput = z.strictObject({
  guestVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export const exchangeInput = z.strictObject({
  publicId: objectIdSchema,
  secret: z.string().regex(/^[a-f0-9]{64}$/),
});
export const rsvpInput = z
  .strictObject({
    invitationId: objectIdSchema,
    status: z.enum(['attending', 'declined']),
    additionalGuests: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .refine((v) => v.status !== 'declined' || v.additionalGuests === 0, {
    message: 'A declined invitation must have zero additional guests.',
    path: ['additionalGuests'],
  });
export function partySize(status: string, additionalGuests: number) {
  return status === 'attending'
    ? (1n + BigInt(additionalGuests)).toString()
    : '0';
}
export type InvitationEvent = {
  id: string;
  eventId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venue: { name: string; address: string };
  status: 'pending' | 'attending' | 'declined';
  additionalGuests: number;
  headcount: string;
  version: number;
  closed: boolean;
};
export type InvitationState = {
  weddingId: string;
  guestId: string;
  guestVersion: number;
  link: null | {
    id: string;
    version: number;
    expiresAt: string;
    active: boolean;
  };
  invitations: InvitationEvent[];
  delivery: string;
  reminderDelivery?: string;
};
export type GuestHubDto = {
  context: string;
  guestName: string;
  couple: string;
  expiresAt: string;
  invitations: InvitationEvent[];
};
export type Attendance = {
  eventId: string;
  title: string;
  pending: number;
  attending: number;
  declined: number;
  headcount: string;
};
