import { authHandler } from '@/modules/auth/http.server';
export const runtime = 'nodejs';
export const POST = authHandler('login');
