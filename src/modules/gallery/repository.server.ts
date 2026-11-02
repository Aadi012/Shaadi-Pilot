import 'server-only';
import mongoose, {
  Schema,
  type Model,
  type Types,
  type ClientSession,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import { galleryIndexes } from './indexes';
import { MAX_PHOTO_BYTES, type PhotoDto } from './contracts';
export interface PhotoRecord {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  uploadedById: Types.ObjectId;
  eventId?: Types.ObjectId;
  name: string;
  mimeType: string;
  expectedBytes: number;
  sizeBytes: number;
  state: PhotoDto['state'];
  stagingKey: string;
  objectKey?: string;
  cleanupKeys: string[];
  uploadUntil: Date;
  expiresAt: Date;
  cleanupAfter: Date;
  leaseOwner?: string;
  leaseUntil?: Date;
  createdAt: Date;
  __v: number;
  width?: number;
  height?: number;
  error?: string;
}
const schema = new Schema<PhotoRecord>(
  {
    weddingId: Schema.Types.ObjectId,
    uploadedById: Schema.Types.ObjectId,
    eventId: Schema.Types.ObjectId,
    name: String,
    mimeType: String,
    expectedBytes: Number,
    sizeBytes: Number,
    state: String,
    stagingKey: String,
    objectKey: String,
    cleanupKeys: [String],
    uploadUntil: Date,
    expiresAt: Date,
    cleanupAfter: Date,
    leaseOwner: String,
    leaseUntil: Date,
    __v: { type: Number, default: 0 },
    width: Number,
    height: Number,
    error: String,
  },
  { collection: 'photos', timestamps: true, autoIndex: false, strict: 'throw' },
);
const requestSchema = new Schema(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    hash: String,
    photoId: Schema.Types.ObjectId,
  },
  {
    collection: 'photoRequests',
    autoIndex: false,
    strict: 'throw',
    timestamps: true,
  },
);
const Photo =
  (mongoose.models.GalleryPhoto as Model<PhotoRecord> | undefined) ??
  mongoose.model<PhotoRecord>('GalleryPhoto', schema);
const Request =
  mongoose.models.PhotoRequest ?? mongoose.model('PhotoRequest', requestSchema);
let ready: Promise<void> | undefined;
export async function database() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of galleryIndexes) {
      const indexes = await db.connection
        .collection(spec.collection)
        .listIndexes()
        .toArray();
      if (
        !indexes.some(
          (i) =>
            i.name === spec.name &&
            JSON.stringify(i.key) === JSON.stringify(spec.key) &&
            (!('unique' in spec) || i.unique),
        )
      )
        throw new Error();
    }
  })().catch(() => {
    ready = undefined;
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Gallery database setup is required.',
    });
  }));
  return db;
}
export const find = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session?: ClientSession,
) =>
  Photo.findOne({ weddingId, _id })
    .session(session ?? null)
    .lean();
export const list = (weddingId: Types.ObjectId, before?: Types.ObjectId) =>
  Photo.find({
    weddingId,
    state: { $ne: 'deleted' },
    ...(before ? { _id: { $lt: before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(25)
    .lean();
export async function usage(
  weddingId: Types.ObjectId,
  session?: ClientSession,
) {
  const rows = await Photo.aggregate<{ count: number; bytes: number }>([
    { $match: { weddingId, state: { $ne: 'deleted' } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        bytes: {
          $sum: {
            $cond: [
              { $eq: ['$state', 'ready'] },
              '$sizeBytes',
              MAX_PHOTO_BYTES,
            ],
          },
        },
      },
    },
  ]).session(session ?? null);
  return rows[0] ?? { count: 0, bytes: 0 };
}
export const receipt = (_id: string, session: ClientSession) =>
  Request.findById(_id).session(session).lean();
export const saveReceipt = (
  row: {
    _id: string;
    weddingId: Types.ObjectId;
    hash: string;
    photoId: Types.ObjectId;
  },
  session: ClientSession,
) => Request.create([row], { session });
export const insert = (
  row: Omit<PhotoRecord, 'createdAt'>,
  session: ClientSession,
) => Photo.create([row], { session });
export const change = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  session?: ClientSession,
) =>
  Photo.findOneAndUpdate({ weddingId, _id, ...filter }, update, {
    session,
    returnDocument: 'after',
  }).lean();
export const cleanupCandidates = (now: Date) =>
  Photo.find({
    state: { $in: ['pending', 'processing', 'rejected', 'deleting'] },
    cleanupAfter: { $lte: now },
  })
    .sort({ cleanupAfter: 1 })
    .limit(5)
    .lean();
export const activeStaging = (now: Date) =>
  Photo.find({
    state: 'ready',
    cleanupKeys: { $ne: [] },
    cleanupAfter: { $lte: now },
  })
    .limit(5)
    .lean();
