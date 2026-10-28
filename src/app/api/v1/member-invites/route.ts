import { after } from 'next/server';
import { createInvitationHandler } from '@/modules/memberships/http.server';
export { invitationsHandler as GET } from '@/modules/memberships/http.server';
export const POST = createInvitationHandler(after);
export const runtime = 'nodejs';
export const maxDuration = 60;
