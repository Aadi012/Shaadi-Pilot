import { expenseHandler } from '@/modules/expenses/http.server';
export const runtime = 'nodejs';
export const GET = expenseHandler('GET', true);
export const PATCH = expenseHandler('PATCH', true);
export const DELETE = expenseHandler('DELETE', true);
