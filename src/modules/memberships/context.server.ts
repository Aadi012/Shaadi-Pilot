import 'server-only';
import { cookies } from 'next/headers';
export const invitationCookieName = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-shaadipilot_invitation'
    : 'shaadipilot_invitation';
export const invitationCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 15 * 60,
});
export async function pendingInvitation() {
  const token = (await cookies()).get(invitationCookieName())?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
