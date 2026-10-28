import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { authIndexes } from './indexes';
import {
  RateLimit,
  Session,
  User,
  type SessionRecord,
  type UserRecord,
} from './models.server';
import { hashSecret, IDLE_MS } from './security.server';

let readiness: Promise<void> | undefined;
export async function authDatabase() {
  const db = await connectDatabase();
  // Fail closed if deployment omitted the uniqueness/TTL index setup.
  await (readiness ??= (async () => {
    for (const spec of authIndexes) {
      const indexes = await db.connection
        .collection(spec.collection)
        .listIndexes()
        .toArray();
      const found = indexes.find((index) => index.name === spec.name);
      if (
        !found ||
        JSON.stringify(found.key) !== JSON.stringify(spec.key) ||
        ('unique' in spec && found.unique !== true) ||
        ('expireAfterSeconds' in spec && found.expireAfterSeconds !== 0)
      )
        throw new Error('Authentication indexes unavailable');
    }
  })().catch(() => {
    readiness = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Account access is temporarily unavailable.',
    });
  }));
  return db;
}
export async function consumeLimit(
  key: string,
  limit: number,
  now = new Date(),
  attempt = 0,
) {
  await authDatabase();
  const windowMs = 15 * 60 * 1000;
  const window = Math.floor(now.getTime() / windowMs);
  const _id = hashSecret(`${key}:${window}`);
  try {
    const bucket = await RateLimit.findOneAndUpdate(
      { _id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
      },
      { upsert: true, returnDocument: 'after' },
    ).lean();
    if (bucket.count > limit)
      throw new ApiError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again in 15 minutes.',
      });
  } catch (error) {
    // Concurrent first inserts can collide on MongoDB's mandatory _id index.
    if (isDuplicate(error) && attempt === 0)
      return consumeLimit(key, limit, now, 1);
    throw error;
  }
}
export const isDuplicate = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 11000;
export async function findSession(
  token: string,
  now = new Date(),
  touch = true,
) {
  await authDatabase();
  const record = await Session.findOne({
    tokenHash: hashSecret(token),
    revokedAt: null,
    expiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  }).lean();
  if (!record) return null;
  const user = await User.findOne({
    _id: record.userId,
    status: 'active',
  }).lean();
  if (!user) return null;
  if (touch && now.getTime() - record.lastSeenAt.getTime() >= 60_000) {
    const updated = await Session.updateOne(
      {
        _id: record._id,
        revokedAt: null,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      {
        $max: {
          lastSeenAt: now,
          expiresAt: new Date(
            Math.min(
              now.getTime() + IDLE_MS,
              record.absoluteExpiresAt.getTime(),
            ),
          ),
        },
      },
    );
    if (!updated.matchedCount) return null;
  }
  return { user, session: record };
}
export const findLoginUser = (email: string) =>
  User.findOne({ emailNormalized: email }).select('+passwordHash').lean();
export async function createUser(
  data: Omit<UserRecord, '_id'>,
  transaction: ClientSession,
) {
  const [user] = await User.create([data], { session: transaction });
  return user;
}
export const recordLogin = (
  user: UserRecord,
  now: Date,
  transaction: ClientSession,
) =>
  User.findOneAndUpdate(
    { _id: user._id, status: 'active', passwordHash: user.passwordHash },
    { $set: { lastLoginAt: now } },
    { session: transaction, returnDocument: 'after' },
  );
export const createSession = (
  data: Omit<SessionRecord, '_id'>,
  transaction: ClientSession,
) => Session.create([data], { session: transaction });
export const revokeSession = (
  token: string,
  now: Date,
  transaction?: ClientSession,
) =>
  Session.updateOne(
    { tokenHash: hashSecret(token), revokedAt: null },
    { $set: { revokedAt: now, expiresAt: now } },
    { session: transaction },
  );

export const findOrganizerForWedding = (
  userId: string,
  transaction?: ClientSession,
) =>
  User.findOne({ _id: userId, status: 'active' })
    .session(transaction ?? null)
    .lean();
export const claimWeddingMembership = (
  userId: string,
  weddingId: Types.ObjectId,
  transaction: ClientSession,
) =>
  User.updateOne(
    { _id: userId, status: 'active', weddingId: null, role: null },
    { $set: { weddingId, role: 'admin' }, $inc: { membershipVersion: 1 } },
    { session: transaction },
  );
export const claimInvitedMembership = (
  userId: string,
  weddingId: Types.ObjectId,
  session: ClientSession,
) =>
  User.updateOne(
    { _id: userId, status: 'active', weddingId: null, role: null },
    { $set: { weddingId, role: 'manager' }, $inc: { membershipVersion: 1 } },
    { session },
  );
export const listWeddingOrganizers = (
  weddingId: Types.ObjectId,
  cursor?: Types.ObjectId,
) =>
  User.find({
    weddingId,
    status: 'active',
    role: { $in: ['admin', 'manager'] },
    ...(cursor ? { _id: { $gt: cursor } } : {}),
  })
    .sort({ _id: 1 })
    .limit(26)
    .lean();
export const existingWeddingOrganizer = (
  weddingId: Types.ObjectId,
  emailNormalized: string,
  session: ClientSession,
) =>
  User.exists({ weddingId, emailNormalized, status: 'active' }).session(
    session,
  );

export const findWeddingOrganizer = (
  userId: Types.ObjectId,
  weddingId: Types.ObjectId,
  session: ClientSession,
) => User.findOne({ _id: userId, weddingId }).session(session).lean();
export async function removeManagerMembership(
  userId: Types.ObjectId,
  weddingId: Types.ObjectId,
  version: number,
  now: Date,
  session: ClientSession,
) {
  const result = await User.updateOne(
    {
      _id: userId,
      weddingId,
      role: 'manager',
      ...(version === 0
        ? {
            $or: [
              { membershipVersion: 0 },
              { membershipVersion: { $exists: false } },
            ],
          }
        : { membershipVersion: version }),
    },
    { $set: { weddingId: null, role: null }, $inc: { membershipVersion: 1 } },
    { session },
  );
  if (result.modifiedCount === 1)
    await Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now, expiresAt: now } },
      { session },
    );
  return result;
}
