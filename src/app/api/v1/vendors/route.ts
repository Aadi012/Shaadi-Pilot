import { vendorHandler } from '@/modules/vendors/http.server';
export const runtime = 'nodejs';
export const GET = vendorHandler('GET');
export const POST = vendorHandler('POST');
