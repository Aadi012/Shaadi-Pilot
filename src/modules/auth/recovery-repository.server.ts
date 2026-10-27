import 'server-only';
import mongoose, {
  Schema,
  type Model,
  type Types,
  type ClientSession,
} from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { authDatabase } from './repository.server';
import { User, Session } from './models.server';
import { recoveryIndexes } from './recovery-indexes';
interface ResetRecord {
  userId: Types.ObjectId;
  tokenHash: string;
  credentialVersion: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
const schema = new Schema<ResetRecord>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, select: false },
    credentialVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'passwordResetTokens', autoIndex: false },
);
export const PasswordReset =
  (mongoose.models.PasswordReset as Model<ResetRecord> | undefined) ??
  mongoose.model<ResetRecord>('PasswordReset', schema);
let ready: Promise<void> | undefined;
export async function recoveryDatabase() {
  const db = await authDatabase();
  await (ready ??= (async () => {
    for (const spec of recoveryIndexes) {
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
      message: 'Password recovery is temporarily unavailable.',
    });
  }));
  return db;
}
export const lockRecoveryUser = (email: string, session: ClientSession) =>
  User.findOneAndUpdate(
    { emailNormalized: email, status: 'active' },
    { $inc: { recoverySequence: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
export const insertReset = (data: ResetRecord, session: ClientSession) =>
  PasswordReset.create([data], { session });
export const findReset = (
  tokenHash: string,
  now: Date,
  session?: ClientSession,
) =>
  PasswordReset.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: now } })
    .session(session ?? null)
    .lean();
export const resetUser = (
  id: Types.ObjectId,
  version: number,
  passwordHash: string,
  session: ClientSession,
) =>
  User.updateOne(
    {
      _id: id,
      status: 'active',
      ...(version === 0
        ? {
            $or: [
              { credentialVersion: 0 },
              { credentialVersion: { $exists: false } },
            ],
          }
        : { credentialVersion: version }),
    },
    { $set: { passwordHash }, $inc: { credentialVersion: 1 } },
    { session },
  );
export const invalidateRecovery = async (
  userId: Types.ObjectId,
  now: Date,
  session: ClientSession,
) => {
  await PasswordReset.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: now } },
    { session },
  );
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now, expiresAt: now } },
    { session },
  );
};
export const findActiveRecoveryUser = (
  userId: Types.ObjectId,
  version: number,
) =>
  User.exists({
    _id: userId,
    status: 'active',
    ...(version === 0
      ? {
          $or: [
            { credentialVersion: 0 },
            { credentialVersion: { $exists: false } },
          ],
        }
      : { credentialVersion: version }),
  });
