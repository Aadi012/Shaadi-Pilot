import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v + 'T12:00:00Z')) &&
      new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v,
    'Enter a valid payment date.',
  );
export const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
    'Amount exceeds supported range.',
  );
const fields = {
  title: z.string().trim().min(1).max(160),
  amountMinor: amount,
  currency: z.literal('INR'),
  paidAt: calendarDate,
  category: z.string().trim().max(80),
  notes: z.string().trim().max(2000),
  eventId: objectIdSchema.nullable(),
};
export const expenseInput = z.strictObject({
  ...fields,
  currency: fields.currency.default('INR'),
  category: fields.category.default(''),
  notes: fields.notes.default(''),
  eventId: fields.eventId.default(null),
});
export const expensePatch = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const expenseQuery = z
  .strictObject({
    eventId: z.union([objectIdSchema, z.literal('none')]).optional(),
    category: z.string().trim().max(80).optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    cursor: z.string().max(200).optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    'End date must follow start date.',
  );
export type ExpenseInput = z.infer<typeof expenseInput>;
export type ExpenseQuery = z.infer<typeof expenseQuery>;
export type ExpenseDto = ExpenseInput & {
  id: string;
  version: number;
  eventTitle: string | null;
};
export type ExpenseSummary = {
  amountMinor: string;
  count: number;
  byEvent: { eventId: string | null; amountMinor: string; count: number }[];
};
export type ExpensePage = {
  weddingId: string;
  expenses: ExpenseDto[];
  nextCursor: string | null;
  summary: ExpenseSummary;
};
export function parseRupees(value: string) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value))
    throw new Error('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return amount.parse(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString(),
  );
}
export function rupees(minor: string) {
  const value = BigInt(minor);
  return (
    (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0')
  );
}
export function formatInr(minor: string) {
  const [whole, fraction] = rupees(minor).split('.');
  return (
    '₹' + new Intl.NumberFormat('en-IN').format(BigInt(whole)) + '.' + fraction
  );
}
