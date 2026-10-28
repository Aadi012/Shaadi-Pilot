import { taskHandler } from '@/modules/tasks/http.server';
export const runtime = 'nodejs';
export const GET = taskHandler('GET', true);
export const PATCH = taskHandler('PATCH', true);
export const DELETE = taskHandler('DELETE', true);
