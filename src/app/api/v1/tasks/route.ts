import { taskHandler } from '@/modules/tasks/http.server';
export const runtime = 'nodejs';
export const GET = taskHandler('GET');
export const POST = taskHandler('POST');
