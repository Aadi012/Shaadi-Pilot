import 'server-only';
import mongoose, {
  Schema,
  type Model,
  type Types,
  type ClientSession,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import type { ExpenseInput, ExpenseQuery, ExpenseSummary } from './contracts';
import { expenseIndexes } from './indexes';
export interface ExpenseRecord extends Omit<ExpenseInput, 'eventId'> {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  eventId: Types.ObjectId | null;
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  __v: number;
}
const schema = new Schema<ExpenseRecord>(
  {
    weddingId: Schema.Types.ObjectId,
    eventId: { type: Schema.Types.ObjectId, default: null },
    title: String,
    amountMinor: String,
    currency: { type: String, enum: ['INR'] },
    paidAt: String,
    category: String,
    notes: String,
    archivedAt: { type: Date, default: null },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
    __v: { type: Number, default: 0 },
  },
  {
    collection: 'expenses',
    timestamps: true,
    strict: 'throw',
    autoIndex: false,
  },
);
const Expense =
  (mongoose.models.PlanningExpense as Model<ExpenseRecord> | undefined) ??
  mongoose.model<ExpenseRecord>('PlanningExpense', schema);
const receiptSchema = new Schema(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    hash: String,
    expenseId: Schema.Types.ObjectId,
  },
  {
    collection: 'expenseRequests',
    timestamps: true,
    autoIndex: false,
    strict: 'throw',
  },
);
const Receipt =
  mongoose.models.ExpenseRequest ??
  mongoose.model('ExpenseRequest', receiptSchema);
let ready: Promise<void> | undefined;
export async function database() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of expenseIndexes) {
      const indexes = await db.connection
        .collection(spec.collection)
        .listIndexes()
        .toArray();
      if (
        !indexes.some(
          (i) =>
            i.name === spec.name &&
            JSON.stringify(i.key) === JSON.stringify(spec.key),
        )
      )
        throw new Error();
    }
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Expense database setup is required.',
    });
  }));
  return db;
}
export const find = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session?: ClientSession,
) =>
  Expense.findOne({ weddingId, _id, archivedAt: null })
    .session(session ?? null)
    .lean();
export const receipt = (_id: string, session: ClientSession) =>
  Receipt.findById(_id).session(session).lean();
export const saveReceipt = (
  data: {
    _id: string;
    weddingId: Types.ObjectId;
    hash: string;
    expenseId: Types.ObjectId;
  },
  session: ClientSession,
) => Receipt.create([data], { session });
export const insert = (data: ExpenseRecord, session: ClientSession) =>
  Expense.create([data], { session });
export const update = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  version: number,
  values: Record<string, unknown>,
  session: ClientSession,
) =>
  Expense.findOneAndUpdate(
    { weddingId, _id, __v: version, archivedAt: null },
    { $set: values, $inc: { __v: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
function filter(weddingId: Types.ObjectId, query: ExpenseQuery) {
  return {
    weddingId,
    archivedAt: null,
    ...(query.eventId
      ? {
          eventId:
            query.eventId === 'none'
              ? null
              : new mongoose.Types.ObjectId(query.eventId),
        }
      : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.from || query.to
      ? {
          paidAt: {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          },
        }
      : {}),
  };
}
export const list = (
  weddingId: Types.ObjectId,
  query: ExpenseQuery,
  before?: Types.ObjectId,
) =>
  Expense.find({
    ...filter(weddingId, query),
    ...(before ? { _id: { $lt: before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(26)
    .lean();
export async function summary(
  weddingId: Types.ObjectId,
  query: ExpenseQuery = {},
): Promise<ExpenseSummary> {
  const rows = await Expense.aggregate<{
    _id: Types.ObjectId | null;
    amountMinor: mongoose.mongo.Decimal128;
    count: number;
  }>([
    { $match: filter(weddingId, query) },
    {
      $group: {
        _id: '$eventId',
        amountMinor: { $sum: { $toDecimal: '$amountMinor' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const byEvent = rows.map((r) => ({
    eventId: r._id?.toString() ?? null,
    amountMinor: r.amountMinor.toString(),
    count: r.count,
  }));
  return {
    amountMinor: byEvent
      .reduce((sum, r) => sum + BigInt(r.amountMinor), 0n)
      .toString(),
    count: byEvent.reduce((sum, r) => sum + r.count, 0),
    byEvent,
  };
}
