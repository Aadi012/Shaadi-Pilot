import { guestHandler } from '@/modules/guests/http.server';
export const runtime = 'nodejs';
export const GET = guestHandler('GET', true);
export const PATCH = guestHandler('PATCH', true);
export const DELETE = guestHandler('DELETE', true);
