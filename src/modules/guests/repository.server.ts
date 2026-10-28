import 'server-only';
import mongoose, {
  Schema,
  type ClientSession,
  type Model,
  type Types,
  type QueryFilter,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import type { GuestInput, GuestQuery } from './contracts';
export interface GuestRecord extends Omit<
  GuestInput,
  'email' | 'selectedEventIds'
> {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  emailNormalized: string;
  selectedEventIds: Types.ObjectId[];
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  __v: number;
}
const schema = new Schema<GuestRecord>(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    displayName: { type: String, required: true },
    emailNormalized: { type: String, required: true },
    phone: { type: String, default: '' },
    notes: { type: String, default: '' },
    selectedEventIds: [Schema.Types.ObjectId],
    archivedAt: { type: Date, default: null },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
    __v: { type: Number, default: 0 },
  },
  { collection: 'guestContacts', autoIndex: false, timestamps: true },
);
export const Guest =
  (mongoose.models.GuestContact as Model<GuestRecord> | undefined) ??
  mongoose.model<GuestRecord>('GuestContact', schema);
interface Receipt {
  _id: string;
  weddingId: Types.ObjectId;
  requestHash: string;
  guestId: Types.ObjectId;
}
const receiptSchema = new Schema<Receipt>(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    requestHash: String,
    guestId: Schema.Types.ObjectId,
  },
  { collection: 'guestRequests', autoIndex: false, timestamps: true },
);
const ReceiptModel =
  (mongoose.models.GuestRequest as Model<Receipt> | undefined) ??
  mongoose.model<Receipt>('GuestRequest', receiptSchema);
export const database = connectDatabase;
export const find = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session?: ClientSession,
) =>
  Guest.findOne({ _id, weddingId, archivedAt: null })
    .session(session ?? null)
    .lean();
export const findRequest = (
  _id: string,
  weddingId: Types.ObjectId,
  session: ClientSession,
) => ReceiptModel.findOne({ _id, weddingId }).session(session).lean();
export const recordRequest = (data: Receipt, session: ClientSession) =>
  ReceiptModel.create([data], { session });
export async function insert(
  data: Omit<GuestRecord, '_id' | '__v'>,
  session: ClientSession,
) {
  const [row] = await Guest.create([{ ...data, __v: 0 }], { session });
  return row.toObject();
}
export const update = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  version: number,
  data: Partial<GuestRecord>,
  session: ClientSession,
) =>
  Guest.findOneAndUpdate(
    { _id, weddingId, archivedAt: null, __v: version },
    { $set: data, $inc: { __v: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
export function list(
  weddingId: Types.ObjectId,
  query: GuestQuery,
  before?: Types.ObjectId,
) {
  const filter: QueryFilter<GuestRecord> = {
    weddingId,
    archivedAt: null,
    ...(before ? { _id: { $lt: before } } : {}),
    ...(query.eventId
      ? { selectedEventIds: new mongoose.Types.ObjectId(query.eventId) }
      : {}),
  };
  if (query.search) {
    const literal = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { displayName: { $regex: literal, $options: 'i' } },
      { emailNormalized: { $regex: literal, $options: 'i' } },
    ];
  }
  return Guest.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .maxTimeMS(3000)
    .lean();
}
export const summary = (weddingId: Types.ObjectId) =>
  Promise.all([
    Guest.countDocuments({ weddingId, archivedAt: null }),
    Guest.countDocuments({
      weddingId,
      archivedAt: null,
      'selectedEventIds.0': { $exists: true },
    }),
  ]).then(([total, withFunctions]) => ({ total, withFunctions }));
export async function duplicateEmails(
  weddingId: Types.ObjectId,
  emails: string[],
  session?: ClientSession,
) {
  return Guest.aggregate<{ _id: string; count: number }>([
    {
      $match: { weddingId, archivedAt: null, emailNormalized: { $in: emails } },
    },
    { $group: { _id: '$emailNormalized', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).session(session ?? null);
}
export async function hasAccessReferences(
  weddingId: Types.ObjectId,
  guestId: Types.ObjectId,
  session: ClientSession,
) {
  const db = await connectDatabase();
  for (const name of ['eventInvitations', 'galleryTokens'])
    if (
      await db.connection
        .collection(name)
        .findOne(
          { weddingId, guestContactId: guestId },
          { session, projection: { _id: 1 } },
        )
    )
      return true;
  return false;
}
