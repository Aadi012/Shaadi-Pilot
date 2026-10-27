import { after } from 'next/server';
import { resetRequestHandler } from '@/modules/auth/recovery-http.server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = resetRequestHandler(after);
