import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import { membershipIndexes } from './indexes';
import {
  MemberInvite,
  MemberInviteRequest,
  type InviteRecord,
  type InviteRequestRecord,
} from './models.server';
let ready: Promise<void> | undefined;
export async function membershipDatabase() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of membershipIndexes) {
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
            !index.sparse &&
            JSON.stringify(index.partialFilterExpression) ===
              JSON.stringify(
                'partialFilterExpression' in spec
                  ? spec.partialFilterExpression
                  : undefined,
              ),
        )
      )
        throw new Error();
    }
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Team access is temporarily unavailable.',
    });
  }));
  return db;
}
export const findInvite = (
  id: Types.ObjectId,
  weddingId: Types.ObjectId,
  session?: ClientSession,
) =>
  MemberInvite.findOne({ _id: id, weddingId })
    .session(session ?? null)
    .lean();
export const findInviteByHash = (tokenHash: string, session?: ClientSession) =>
  MemberInvite.findOne({ tokenHash })
    .session(session ?? null)
    .lean();
export const findPendingInvite = (
  weddingId: Types.ObjectId,
  emailNormalized: string,
  session: ClientSession,
) =>
  MemberInvite.findOne({ weddingId, emailNormalized, state: 'pending' })
    .session(session)
    .lean();
export const expirePendingInvites = (
  weddingId: Types.ObjectId,
  emailNormalized: string,
  now: Date,
  session: ClientSession,
) =>
  MemberInvite.updateMany(
    { weddingId, emailNormalized, state: 'pending', expiresAt: { $lte: now } },
    { $set: { state: 'expired' } },
    { session },
  );
export const insertInvite = (data: InviteRecord, session: ClientSession) =>
  MemberInvite.create([data], { session });
export const findInviteRequest = (id: string, session: ClientSession) =>
  MemberInviteRequest.findById(id).session(session).lean();
export const insertInviteRequest = (
  data: InviteRequestRecord,
  session: ClientSession,
) => MemberInviteRequest.create([data], { session });
export const listInvites = (
  weddingId: Types.ObjectId,
  cursor?: Types.ObjectId,
) =>
  MemberInvite.find({ weddingId, ...(cursor ? { _id: { $lt: cursor } } : {}) })
    .sort({ _id: -1 })
    .limit(26)
    .lean();
export const consumeInvite = (
  id: Types.ObjectId,
  userId: Types.ObjectId,
  now: Date,
  session: ClientSession,
) =>
  MemberInvite.updateOne(
    { _id: id, state: 'pending', expiresAt: { $gt: now } },
    { $set: { state: 'accepted', consumedAt: now, consumedBy: userId } },
    { session },
  );
export const revokeInvite = (
  id: Types.ObjectId,
  weddingId: Types.ObjectId,
  now: Date,
  session: ClientSession,
) =>
  MemberInvite.findOneAndUpdate(
    { _id: id, weddingId, state: 'pending' },
    { $set: { state: 'revoked', revokedAt: now } },
    { session, returnDocument: 'after' },
  ).lean();

export const invalidateMemberInvitations = (
  weddingId: Types.ObjectId,
  emailNormalized: string,
  now: Date,
  session: ClientSession,
) =>
  MemberInvite.updateMany(
    { weddingId, emailNormalized, state: { $in: ['pending', 'accepted'] } },
    { $set: { state: 'revoked', revokedAt: now } },
    { session },
  );
