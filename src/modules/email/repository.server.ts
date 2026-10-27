import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import { emailIndexes } from './indexes';
import {
  EmailBatch,
  EmailDelivery,
  type DeliveryRecord,
  type DeliveryState,
} from './models.server';
let ready: Promise<void> | undefined;
export async function emailDatabase() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of emailIndexes) {
      const indexes = await db.connection
        .collection(spec.collection)
        .listIndexes()
        .toArray();
      if (
        !indexes.some(
          (index) =>
            index.name === spec.name &&
            JSON.stringify(index.key) === JSON.stringify(spec.key) &&
            (!('unique' in spec) || index.unique === true) &&
            (!('expireAfterSeconds' in spec) || index.expireAfterSeconds === 0),
        )
      )
        throw new Error();
    }
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Email service is temporarily unavailable.',
    });
  }));
  return db;
}
export const insertDelivery = async (
  delivery: Omit<DeliveryRecord, '_id'> & { _id: Types.ObjectId },
  batch: {
    payloadHash: string;
    encrypted: { keyId: string; iv: string; tag: string; ciphertext: string };
  },
  session: ClientSession,
) => {
  await EmailDelivery.create([delivery], { session });
  await EmailBatch.create(
    [
      {
        _id: delivery._id,
        idempotencyKey: `password-reset/${delivery._id}`,
        ...batch,
        expiresAt: delivery.expiresAt,
      },
    ],
    { session },
  );
};
export const claimDelivery = (now: Date, id?: string) =>
  EmailDelivery.findOneAndUpdate(
    {
      scope: 'platform',
      kind: 'password-reset',
      ...(id ? { _id: new Types.ObjectId(id) } : {}),
      $or: [
        { state: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now } },
        { state: 'leased', leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        state: 'leased',
        leaseUntil: new Date(now.getTime() + 60000),
        leaseOwner: randomUUID(),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { nextAttemptAt: 1 } },
  )
    .select('+tokenHash')
    .lean();
export const findBatch = (id: Types.ObjectId) =>
  EmailBatch.findById(id).select('+encrypted').lean();
export async function finishDelivery(
  delivery: DeliveryRecord,
  state: DeliveryState,
  extra: Record<string, unknown> = {},
) {
  const db = await emailDatabase();
  await db.connection.transaction(async (session) => {
    const result = await EmailDelivery.updateOne(
      { _id: delivery._id, state: 'leased', leaseOwner: delivery.leaseOwner },
      { $set: { state, leaseUntil: null, leaseOwner: null, ...extra } },
      { session },
    );
    if (result.modifiedCount && !['retry'].includes(state))
      await EmailBatch.updateOne(
        { _id: delivery._id },
        { $unset: { encrypted: 1 } },
        { session },
      );
  });
}
export const markAttempt = (delivery: DeliveryRecord, now: Date) =>
  EmailDelivery.updateOne(
    { _id: delivery._id, state: 'leased', leaseOwner: delivery.leaseOwner },
    { $set: { firstAttemptAt: delivery.firstAttemptAt ?? now } },
  );
