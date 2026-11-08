import { discoveryHandler } from '@/modules/vendors/discovery-http.server';
export const runtime = 'nodejs';
export const POST = discoveryHandler('save');
