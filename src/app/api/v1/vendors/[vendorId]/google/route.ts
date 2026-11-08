import { discoveryHandler } from '@/modules/vendors/discovery-http.server';
export const runtime = 'nodejs';
export const GET = discoveryHandler('details');
