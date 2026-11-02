import { organizerInvitationHandler } from '@/modules/invitations/http.server';
export const runtime = 'nodejs';
export const POST = organizerInvitationHandler('revoke');
