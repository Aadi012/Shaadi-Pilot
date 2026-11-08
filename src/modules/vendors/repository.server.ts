import 'server-only';
import mongoose, {
  Schema,
  type Model,
  type Types,
  type ClientSession,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import { ApiError } from '@/lib/api/errors';
import type { VendorInput, VendorQuery } from './contracts';
import { vendorIndexes, vendorPlaceIndexes } from './indexes';
export interface VendorRecord extends VendorInput {
  source: 'manual' | 'google';
  googlePlaceId?: string | null;
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  __v: number;
}
const schema = new Schema<VendorRecord>(
  {
    weddingId: Schema.Types.ObjectId,
    name: String,
    category: String,
    phone: String,
    email: String,
    website: String,
    address: String,
    notes: String,
    source: { type: String, enum: ['manual', 'google'], default: 'manual' },
    googlePlaceId: { type: String, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
    __v: { type: Number, default: 0 },
  },
  {
    collection: 'vendors',
    timestamps: true,
    strict: 'throw',
    autoIndex: false,
  },
);
const Vendor =
  (mongoose.models.PlanningVendor as Model<VendorRecord> | undefined) ??
  mongoose.model<VendorRecord>('PlanningVendor', schema);
const receiptSchema = new Schema(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    hash: String,
    vendorId: Schema.Types.ObjectId,
  },
  {
    collection: 'vendorRequests',
    timestamps: true,
    autoIndex: false,
    strict: 'throw',
  },
);
const Receipt =
  mongoose.models.VendorRequest ??
  mongoose.model('VendorRequest', receiptSchema);
let ready: Promise<void> | undefined;
export async function database() {
  const db = await connectDatabase();
  await (ready ??= (async () => {
    for (const spec of vendorIndexes) {
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
      message: 'Vendor database setup is required.',
    });
  }));
  return db;
}
export const find = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  session?: ClientSession,
) =>
  Vendor.findOne({ weddingId, _id, archivedAt: null })
    .session(session ?? null)
    .lean();
export const receipt = (_id: string, session?: ClientSession) =>
  Receipt.findById(_id)
    .session(session ?? null)
    .lean();
export const saveReceipt = (
  data: {
    _id: string;
    weddingId: Types.ObjectId;
    hash: string;
    vendorId: Types.ObjectId;
  },
  session: ClientSession,
) => Receipt.create([data], { session });
export const insert = (data: VendorRecord, session: ClientSession) =>
  Vendor.create([data], { session });
export const update = (
  weddingId: Types.ObjectId,
  _id: Types.ObjectId,
  version: number,
  values: Record<string, unknown>,
  session: ClientSession,
) =>
  Vendor.findOneAndUpdate(
    { weddingId, _id, __v: version, archivedAt: null },
    { $set: values, $inc: { __v: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
function filter(weddingId: Types.ObjectId, query: VendorQuery) {
  return {
    weddingId,
    archivedAt: null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.search
      ? {
          name: {
            $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i',
          },
        }
      : {}),
  };
}
export const list = (
  weddingId: Types.ObjectId,
  query: VendorQuery,
  before?: Types.ObjectId,
) =>
  Vendor.find({
    ...filter(weddingId, query),
    ...(before ? { _id: { $lt: before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(26)
    .lean();
export const count = (weddingId: Types.ObjectId, query: VendorQuery) =>
  Vendor.countDocuments(filter(weddingId, query));

export const findPlace = (
  weddingId: Types.ObjectId,
  googlePlaceId: string,
  session?: ClientSession,
) =>
  Vendor.findOne({ weddingId, googlePlaceId, archivedAt: null })
    .session(session ?? null)
    .lean();
export const savedPlaces = (weddingId: Types.ObjectId, ids: string[]) =>
  Vendor.find({ weddingId, googlePlaceId: { $in: ids }, archivedAt: null })
    .select('_id googlePlaceId')
    .lean();

export async function placeDatabase() {
  const db = await database();
  const indexes = await db.connection
    .collection('vendors')
    .listIndexes()
    .toArray();
  const spec = vendorPlaceIndexes[0];
  if (
    !indexes.some(
      (i) =>
        i.name === spec.name &&
        i.unique === true &&
        JSON.stringify(i.key) === JSON.stringify(spec.key) &&
        JSON.stringify(i.partialFilterExpression) ===
          JSON.stringify(spec.partialFilterExpression),
    )
  )
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Google vendor saving requires database setup. Manual vendors remain available.',
    });
  return db;
}
