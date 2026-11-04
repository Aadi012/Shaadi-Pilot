import { vendorHandler } from '@/modules/vendors/http.server';
export const runtime = 'nodejs';
export const GET = vendorHandler('GET', true);
export const PATCH = vendorHandler('PATCH', true);
export const DELETE = vendorHandler('DELETE', true);
