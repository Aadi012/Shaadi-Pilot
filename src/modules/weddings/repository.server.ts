import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import {
  Wedding,
  WeddingCreation,
  type WeddingRecord,
  type CreationRecord,
} from './models.server';
import { weddingIndexes } from './indexes';
import type { EditWeddingInput } from './contracts';
export const updateWeddingDetails = (
  id: Types.ObjectId,
  version: number,
  data: EditWeddingInput,
  transaction: ClientSession,
) =>
  Wedding.findOneAndUpdate(
    {
      _id: id,
      status: 'active',
      ...(version === 0
        ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
        : { __v: version }),
    },
    {
      $set: {
        displayNames: data.displayNames,
        weddingDate: data.weddingDate,
        'defaultLocation.name': data.location,
        timezone: data.timezone,
      },
      $inc: { __v: 1 },
    },
    { returnDocument: 'after', session: transaction, runValidators: true },
  ).lean();
let ready: Promise<void> | undefined;
export async function weddingDatabase() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const index of weddingIndexes) {
      const list = await db.connection
        .collection(index.collection)
        .listIndexes()
        .toArray();
      if (
        !list.some(
          (item) =>
            item.name === index.name &&
            item.unique === true &&
            JSON.stringify(item.key) === JSON.stringify(index.key) &&
            !item.partialFilterExpression &&
            !item.sparse,
        )
      )
        throw new Error('Missing wedding index');
    }
    await db.connection.collection('weddingCreations').listIndexes().toArray();
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Wedding setup is temporarily unavailable.',
    });
  }));
  return db;
}
export const findWedding = (id: Types.ObjectId, transaction?: ClientSession) =>
  Wedding.findOne({ _id: id, status: 'active' })
    .session(transaction ?? null)
    .lean();
export const findCreation = (id: string, transaction?: ClientSession) =>
  WeddingCreation.findById(id)
    .session(transaction ?? null)
    .lean();
export const slugExists = (slug: string) => Wedding.exists({ slug });
export async function insertWedding(
  data: Omit<WeddingRecord, '_id'>,
  transaction: ClientSession,
) {
  const [wedding] = await Wedding.create([data], { session: transaction });
  return wedding;
}
export const insertCreation = (
  data: CreationRecord,
  transaction: ClientSession,
) => WeddingCreation.create([data], { session: transaction });
