import 'server-only';
import mongoose, {
  Schema,
  type Model,
  type Types,
  type ClientSession,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import { invitationIndexes } from './indexes';
export interface LinkRecord {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  guestContactId: Types.ObjectId;
  tokenHash: string;
  encrypted: { keyId: string; iv: string; tag: string; ciphertext: string };
  expiresAt: Date;
  revokedAt: Date | null;
  __v: number;
  deliveryId?: Types.ObjectId;
  reminderDeliveryId?: Types.ObjectId;
}
export interface InvitationRecord {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  guestContactId: Types.ObjectId;
  eventId: Types.ObjectId;
  linkId: Types.ObjectId;
  revokedAt: Date | null;
  rsvpStatus: 'pending' | 'attending' | 'declined';
  additionalGuests: number;
  respondedAt?: Date;
  __v: number;
}
interface GuestSession {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  linkId: Types.ObjectId;
  generation: number;
  tokenHash: string;
  expiresAt: Date;
}
interface Receipt {
  _id: string;
  weddingId: Types.ObjectId;
  requestHash: string;
  linkId: Types.ObjectId;
  generation: number;
  deliveryId?: Types.ObjectId;
}
const oid = Schema.Types.ObjectId;
const common = {
  collection: '',
  autoIndex: false,
  timestamps: true,
  strict: 'throw' as const,
};
const linkSchema = new Schema<LinkRecord>(
  {
    weddingId: oid,
    guestContactId: oid,
    tokenHash: { type: String, select: false },
    encrypted: {
      type: new Schema(
        { keyId: String, iv: String, tag: String, ciphertext: String },
        { _id: false },
      ),
      select: false,
    },
    expiresAt: Date,
    revokedAt: { type: Date, default: null },
    __v: { type: Number, default: 0 },
    deliveryId: oid,
    reminderDeliveryId: oid,
  },
  { ...common, collection: 'guestInvitationLinks' },
);
const inviteSchema = new Schema<InvitationRecord>(
  {
    weddingId: oid,
    guestContactId: oid,
    eventId: oid,
    linkId: oid,
    revokedAt: { type: Date, default: null },
    rsvpStatus: {
      type: String,
      enum: ['pending', 'attending', 'declined'],
      default: 'pending',
    },
    additionalGuests: { type: Number, default: 0 },
    respondedAt: Date,
    __v: { type: Number, default: 0 },
  },
  { ...common, collection: 'eventInvitations' },
);
const sessionSchema = new Schema<GuestSession>(
  {
    weddingId: oid,
    linkId: oid,
    generation: Number,
    tokenHash: { type: String, select: false },
    expiresAt: Date,
  },
  { ...common, collection: 'guestInvitationSessions' },
);
const receiptSchema = new Schema<Receipt>(
  {
    _id: String,
    weddingId: oid,
    requestHash: String,
    linkId: oid,
    generation: Number,
    deliveryId: oid,
  },
  { ...common, collection: 'guestInvitationRequests' },
);
const Link =
  (mongoose.models.GuestInvitationLink as Model<LinkRecord> | undefined) ??
  mongoose.model<LinkRecord>('GuestInvitationLink', linkSchema);
const Invitation =
  (mongoose.models.EventInvitation as Model<InvitationRecord> | undefined) ??
  mongoose.model<InvitationRecord>('EventInvitation', inviteSchema);
const Session =
  (mongoose.models.GuestInvitationSession as Model<GuestSession> | undefined) ??
  mongoose.model<GuestSession>('GuestInvitationSession', sessionSchema);
const Request =
  (mongoose.models.GuestInvitationRequest as Model<Receipt> | undefined) ??
  mongoose.model<Receipt>('GuestInvitationRequest', receiptSchema);
let ready: Promise<void> | undefined;
export async function database() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of invitationIndexes) {
      const indexes = await db.connection
        .collection(spec.collection)
        .listIndexes()
        .toArray();
      if (
        !indexes.some(
          (i) =>
            i.name === spec.name &&
            JSON.stringify(i.key) === JSON.stringify(spec.key) &&
            (!('unique' in spec) || i.unique === true) &&
            (!('expireAfterSeconds' in spec) || i.expireAfterSeconds === 0),
        )
      )
        throw new Error();
    }
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Guest invitations are not configured yet.',
    });
  }));
  return db;
}
export const linkForGuest = (
  weddingId: Types.ObjectId,
  guestContactId: Types.ObjectId,
  session?: ClientSession,
) =>
  Link.findOne({ weddingId, guestContactId })
    .session(session ?? null)
    .lean();
export const linkById = (
  _id: Types.ObjectId,
  session?: ClientSession,
  secrets = false,
) =>
  Link.findOne({ _id })
    .select(secrets ? '+tokenHash +encrypted' : '')
    .session(session ?? null)
    .lean();
export const privateLink = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session: ClientSession,
) =>
  Link.findOne({ weddingId, _id })
    .select('+tokenHash +encrypted')
    .session(session)
    .lean();
export async function saveLink(
  data: LinkRecord,
  existing: boolean,
  session: ClientSession,
) {
  if (!existing) await Link.create([data], { session });
  else {
    const { _id, ...fields } = data;
    await Link.updateOne(
      { _id, weddingId: data.weddingId },
      {
        $set: fields,
        ...(!data.deliveryId
          ? { $unset: { deliveryId: '', reminderDeliveryId: '' } }
          : {}),
      },
      { session },
    );
  }
}
export const setDelivery = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  deliveryId: Types.ObjectId,
  session: ClientSession,
) => Link.updateOne({ weddingId, _id }, { $set: { deliveryId } }, { session });
export const revokePairs = (
  weddingId: Types.ObjectId,
  linkId: Types.ObjectId,
  session: ClientSession,
) =>
  Invitation.updateMany(
    { weddingId, linkId, revokedAt: null },
    { $set: { revokedAt: new Date() }, $inc: { __v: 1 } },
    { session },
  );
export const revokeLink = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session: ClientSession,
) =>
  Link.updateOne(
    { weddingId, _id },
    { $set: { revokedAt: new Date() }, $inc: { __v: 1 } },
    { session },
  );
export const activatePair = (
  weddingId: Types.ObjectId,
  linkId: Types.ObjectId,
  guestContactId: Types.ObjectId,
  eventId: Types.ObjectId,
  session: ClientSession,
) =>
  Invitation.updateOne(
    { weddingId, eventId, guestContactId },
    {
      $set: { linkId, revokedAt: null },
      $inc: { __v: 1 },
      $setOnInsert: { rsvpStatus: 'pending', additionalGuests: 0 },
    },
    { upsert: true, session },
  );
export const pairs = (
  weddingId: Types.ObjectId,
  linkId: Types.ObjectId,
  session?: ClientSession,
) =>
  Invitation.find({ weddingId, linkId, revokedAt: null })
    .sort({ _id: 1 })
    .limit(101)
    .session(session ?? null)
    .lean();
export const updateRsvp = (
  row: InvitationRecord,
  status: 'attending' | 'declined',
  additionalGuests: number,
  session: ClientSession,
) =>
  Invitation.findOneAndUpdate(
    { _id: row._id, weddingId: row.weddingId, __v: row.__v, revokedAt: null },
    {
      $set: { rsvpStatus: status, additionalGuests, respondedAt: new Date() },
      $inc: { __v: 1 },
    },
    { returnDocument: 'after', session },
  ).lean();
export const receipt = (
  _id: string,
  weddingId: Types.ObjectId,
  session: ClientSession,
) => Request.findOne({ _id, weddingId }).session(session).lean();
export const saveReceipt = (data: Receipt, session: ClientSession) =>
  Request.create([data], { session });
export const createSession = (
  data: Omit<GuestSession, '_id'>,
  session: ClientSession,
) => Session.create([data], { session });
export const findSession = (tokenHash: string, session?: ClientSession) =>
  Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
    .session(session ?? null)
    .lean();
export const deleteSession = (tokenHash: string, session?: ClientSession) =>
  Session.deleteOne({ tokenHash }, { session });
export async function activeAttendance(weddingId: Types.ObjectId) {
  const db = await connectDatabase();
  return db.connection
    .collection('eventInvitations')
    .aggregate<{
      _id: Types.ObjectId;
      pending: number;
      attending: number;
      declined: number;
      headcount: string;
    }>([
      { $match: { weddingId, revokedAt: null } },
      {
        $lookup: {
          from: 'guestInvitationLinks',
          localField: 'linkId',
          foreignField: '_id',
          as: 'link',
        },
      },
      { $unwind: '$link' },
      {
        $match: {
          'link.weddingId': weddingId,
          'link.revokedAt': null,
          'link.expiresAt': { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: '$eventId',
          pending: {
            $sum: { $cond: [{ $eq: ['$rsvpStatus', 'pending'] }, 1, 0] },
          },
          attending: {
            $sum: { $cond: [{ $eq: ['$rsvpStatus', 'attending'] }, 1, 0] },
          },
          declined: {
            $sum: { $cond: [{ $eq: ['$rsvpStatus', 'declined'] }, 1, 0] },
          },
          headcount: {
            $sum: {
              $cond: [
                { $eq: ['$rsvpStatus', 'attending'] },
                {
                  $add: [
                    // BSON doubles convert to decimal with only 15 significant
                    // digits. First convert the validated integer to int64.
                    { $toDecimal: { $toLong: '$additionalGuests' } },
                    { $toDecimal: '1' },
                  ],
                },
                { $toDecimal: '0' },
              ],
            },
          },
        },
      },
      { $set: { headcount: { $toString: '$headcount' } } },
    ])
    .toArray();
}

export const setReminderDelivery = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  reminderDeliveryId: Types.ObjectId,
  session: ClientSession,
) =>
  Link.updateOne(
    { weddingId, _id },
    { $set: { reminderDeliveryId } },
    { session },
  );
export const eventPairs = (
  weddingId: Types.ObjectId,
  eventId: Types.ObjectId,
  after?: Types.ObjectId,
) =>
  Invitation.find({
    weddingId,
    eventId,
    ...(after ? { _id: { $gt: after } } : {}),
  })
    .sort({ _id: 1 })
    .limit(51)
    .lean();
