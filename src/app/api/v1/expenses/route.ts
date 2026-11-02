import { expenseHandler } from '@/modules/expenses/http.server';
export const runtime = 'nodejs';
export const GET = expenseHandler('GET', false);
export const POST = expenseHandler('POST', false);
