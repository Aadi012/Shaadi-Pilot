import { eventHandler } from '@/modules/events/http.server';
export const runtime = 'nodejs';
export const GET = eventHandler('GET', true);
export const PATCH = eventHandler('PATCH', true);
export const DELETE = eventHandler('DELETE', true);
