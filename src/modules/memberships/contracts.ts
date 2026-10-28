import { z } from 'zod';
export const inviteSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
});
export const inviteKeySchema = z.uuid();
export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const inviteContextSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const acceptInviteSchema = z.strictObject({
  invitationId: objectIdSchema,
});
export type MemberDto = {
  id: string;
  name: string;
  role: 'admin' | 'manager';
  membershipVersion: number;
};
export type InviteDto = {
  id: string;
  email: string;
  role: 'manager';
  state: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  delivery:
    | 'pending'
    | 'leased'
    | 'retry'
    | 'submitted'
    | 'failed'
    | 'cancelled'
    | 'quarantined'
    | 'unavailable';
};
export type JoinView = {
  state:
    | 'invalid'
    | 'signed-out'
    | 'wrong-email'
    | 'other-wedding'
    | 'eligible'
    | 'already-member';
  invitation?: {
    id: string;
    weddingId: string;
    couple: string;
    role: 'manager';
    expiresAt: string;
  };
  user?: { id: string; email: string };
};
