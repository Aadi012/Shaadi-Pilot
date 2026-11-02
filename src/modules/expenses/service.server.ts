import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { planningEvents } from '@/modules/events/service.server';
import {
  objectIdSchema,
  inviteKeySchema,
} from '@/modules/memberships/contracts';
import { hashSecret } from '@/modules/auth/security.server';
import {
  expenseInput,
  expensePatch,
  expenseQuery,
  type ExpenseDto,
} from './contracts';
import * as repo from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
const oid = (id: string) => new Types.ObjectId(objectIdSchema.parse(id));
async function tenant(
  userId: string,
  expected?: string,
  session?: ClientSession,
) {
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access unavailable.');
  if (expected && user.weddingId.toString() !== expected)
    throw fail(
      409,
      'WEDDING_CONTEXT_CHANGED',
      'Your wedding changed. Reload before saving.',
    );
  if (!(await activeWeddingForMembership(user.weddingId, session)))
    throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return user.weddingId;
}
async function dto(
  row: repo.ExpenseRecord,
  session?: ClientSession,
): Promise<ExpenseDto> {
  const event = row.eventId
    ? (await planningEvents(row.weddingId, [row.eventId], session))[0]
    : null;
  return {
    id: row._id.toString(),
    title: row.title,
    amountMinor: row.amountMinor,
    currency: 'INR',
    paidAt: row.paidAt,
    category: row.category,
    notes: row.notes,
    eventId: row.eventId?.toString() ?? null,
    eventTitle: event?.title ?? null,
    version: row.__v,
  };
}
export async function listExpenses(userId: string, input: unknown = {}) {
  await repo.database();
  const weddingId = await tenant(userId),
    query = expenseQuery.parse(input);
  const { cursor, ...filters } = query;
  const fingerprint = hashSecret(JSON.stringify({ weddingId, ...filters }));
  let before: Types.ObjectId | undefined;
  if (cursor) {
    const parts = cursor.split(':');
    if (parts.length !== 2 || parts[0] !== fingerprint)
      throw fail(400, 'INVALID_QUERY', 'Refresh expenses before loading more.');
    before = oid(parts[1]);
  }
  const rows = await repo.list(weddingId, query, before);
  return {
    weddingId: weddingId.toString(),
    expenses: await Promise.all(rows.slice(0, 25).map((r) => dto(r))),
    nextCursor: rows.length > 25 ? fingerprint + ':' + rows[24]._id : null,
    summary: await repo.summary(weddingId, query),
  };
}
export async function readExpense(userId: string, id: string) {
  await repo.database();
  const weddingId = await tenant(userId),
    row = await repo.find(weddingId, oid(id));
  if (!row) throw fail(404, 'NOT_FOUND', 'Expense not found.');
  return { weddingId: weddingId.toString(), expense: await dto(row) };
}
export async function expenseSummary(userId: string) {
  await repo.database();
  const weddingId = await tenant(userId);
  return {
    weddingId: weddingId.toString(),
    summary: await repo.summary(weddingId),
  };
}
export const trustedExpenseSummary = (weddingId: string) =>
  repo.summary(oid(weddingId));
export async function writeExpense(
  userId: string,
  expected: string,
  input: unknown,
  options: {
    id?: string;
    version?: number;
    archive?: boolean;
    key?: string;
  } = {},
) {
  const data = options.archive
    ? undefined
    : options.id
      ? expensePatch.parse(input)
      : expenseInput.parse(input);
  objectIdSchema.parse(expected);
  const key = !options.id
    ? hashSecret(
        userId +
          ':' +
          expected +
          ':expense:' +
          inviteKeySchema.parse(options.key),
      )
    : undefined;
  const hash = hashSecret(JSON.stringify(data ?? null));
  const db = await repo.database();
  return db.connection.transaction(async (session) => {
    const weddingId = await tenant(userId, expected, session);
    await lockWeddingMembership(weddingId, session);
    if (key) {
      const receipt = await repo.receipt(key, session);
      if (receipt) {
        if (receipt.hash !== hash)
          throw fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key was used for different expense details.',
          );
        const row = await repo.find(weddingId, receipt.expenseId!, session);
        if (!row)
          throw fail(
            409,
            'EXPENSE_ARCHIVED',
            'The original expense was removed. Refresh before starting another.',
          );
        return { weddingId: expected, expense: await dto(row, session) };
      }
    }
    let row = options.id
      ? await repo.find(weddingId, oid(options.id), session)
      : null;
    if (options.id && !row) throw fail(404, 'NOT_FOUND', 'Expense not found.');
    if (row && row.__v !== options.version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This expense changed. Your draft is kept. Load and review the latest details.',
      );
    if (
      data?.eventId &&
      (await planningEvents(weddingId, [oid(data.eventId)], session)).length !==
        1
    )
      throw fail(404, 'NOT_FOUND', 'Function not found.');
    if (!row) {
      const parsed = expenseInput.parse(data);
      const id = new Types.ObjectId();
      await repo.insert(
        {
          ...parsed,
          _id: id,
          weddingId,
          eventId: parsed.eventId ? oid(parsed.eventId) : null,
          archivedAt: null,
          createdBy: oid(userId),
          updatedBy: oid(userId),
          __v: 0,
        },
        session,
      );
      await repo.saveReceipt(
        { _id: key!, weddingId, hash, expenseId: id },
        session,
      );
      row = (await repo.find(weddingId, id, session))!;
    } else {
      row = await repo.update(
        weddingId,
        row._id,
        options.version!,
        {
          ...(data ?? {}),
          ...(data && 'eventId' in data
            ? { eventId: data.eventId ? oid(data.eventId) : null }
            : {}),
          ...(options.archive ? { archivedAt: new Date() } : {}),
          updatedBy: oid(userId),
        },
        session,
      );
      if (!row)
        throw fail(
          412,
          'PRECONDITION_FAILED',
          'Expense changed. Refresh before saving.',
        );
    }
    return { weddingId: expected, expense: await dto(row, session) };
  });
}
