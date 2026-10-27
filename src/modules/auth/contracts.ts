import { z } from 'zod';

export const REGISTRATION_MESSAGE =
  'Please continue to log in. If you already have an account, use your existing password.';

const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());
export const passwordSchema = z
  .string()
  .max(128)
  .refine((value) => [...value].length >= 15, 'Use at least 15 characters.');
export const registerSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(100),
  email,
  password: passwordSchema,
});
export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Organizer = {
  id: string;
  displayName: string;
  email: string;
  weddingId: string | null;
  role: 'admin' | 'manager' | null;
};
export type SessionData = { user: Organizer | null; csrfToken: string };
export const RESET_REQUEST_MESSAGE =
  "If an account exists for that email, we'll send a password reset link.";
export const resetRequestSchema = z.strictObject({ email });
export const resetTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const resetInspectSchema = z.strictObject({ token: resetTokenSchema });
export const resetConfirmSchema = z.strictObject({
  token: resetTokenSchema,
  password: passwordSchema,
});
