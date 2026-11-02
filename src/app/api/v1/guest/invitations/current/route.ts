import { guestHandler } from '@/modules/invitations/http.server';
export const runtime = 'nodejs';
export const GET = guestHandler('current');
