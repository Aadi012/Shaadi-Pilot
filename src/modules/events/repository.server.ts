import 'server-only';
import type { Types } from 'mongoose';
import mongoose, { Schema, type ClientSession, type Model } from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import type { EventInput } from './contracts';
interface RecordType extends Omit<EventInput, 'startsAt' | 'endsAt'> {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  status: 'active' | 'archived';
  __v: number;
}
const schema = new Schema<RecordType>(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    title: String,
    description: String,
    startsAt: Date,
    endsAt: Date,
    timezone: String,
    venue: { name: String, address: String },
    status: { type: String, default: 'active' },
    __v: { type: Number, default: 0 },
  },
  { collection: 'events', autoIndex: false, timestamps: true },
);
const Event =
  (mongoose.models.PlanningEvent as Model<RecordType> | undefined) ??
  mongoose.model<RecordType>('PlanningEvent', schema);
export const database = connectDatabase;
export const list = (
  weddingId: Types.ObjectId,
  after?: { startsAt: Date; id: Types.ObjectId },
) =>
  Event.find({
    weddingId,
    status: 'active',
    ...(after
      ? {
          $or: [
            { startsAt: { $gt: after.startsAt } },
            { startsAt: after.startsAt, _id: { $gt: after.id } },
          ],
        }
      : {}),
  })
    .sort({ startsAt: 1, _id: 1 })
    .limit(101)
    .lean();
export const find = (
  weddingId: Types.ObjectId,
  id: Types.ObjectId,
  session?: ClientSession,
) =>
  Event.findOne({ _id: id, weddingId, status: 'active' })
    .session(session ?? null)
    .lean();
export async function insert(
  weddingId: Types.ObjectId,
  data: EventInput,
  session: ClientSession,
) {
  const [row] = await Event.create(
    [
      {
        ...data,
        weddingId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        status: 'active',
        __v: 0,
      },
    ],
    { session },
  );
  return row.toObject();
}
export const update = (
  weddingId: Types.ObjectId,
  id: Types.ObjectId,
  version: number,
  data: EventInput | undefined,
  session: ClientSession,
) =>
  Event.findOneAndUpdate(
    { _id: id, weddingId, status: 'active', __v: version },
    {
      $set: data
        ? {
            ...data,
            startsAt: new Date(data.startsAt),
            endsAt: new Date(data.endsAt),
          }
        : { status: 'archived' },
      $inc: { __v: 1 },
    },
    { session, returnDocument: 'after' },
  ).lean();
export async function hasReferences(
  weddingId: Types.ObjectId,
  eventId: Types.ObjectId,
  session: ClientSession,
) {
  const db = await connectDatabase();
  for (const name of [
    'tasks',
    'expenses',
    'eventInvitations',
    'photos',
    'vendors',
  ]) {
    if (
      await db.connection
        .collection(name)
        .findOne(
          { weddingId, $or: [{ eventId }, { eventIds: eventId }] },
          { session, projection: { _id: 1 } },
        )
    )
      return true;
  }
  return false;
}
