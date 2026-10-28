import { eventHandler } from '@/modules/events/http.server';
export const runtime = 'nodejs';
export const GET = eventHandler('GET');
export const POST = eventHandler('POST');
