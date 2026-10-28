import { guestHandler } from '@/modules/guests/http.server';
export const runtime = 'nodejs';
export const GET = guestHandler('GET');
export const POST = guestHandler('POST');
