import 'server-only';
import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { CreateWeddingInput } from './contracts';
export interface WeddingRecord {
  _id: Types.ObjectId;
  displayNames: CreateWeddingInput['displayNames'];
  weddingDate: string;
  defaultLocation: { name: string };
  timezone: string;
  slug: string;
  isPublished: boolean;
  status: 'active' | 'archived' | 'deleting';
  createdBy: Types.ObjectId;
  __v?: number;
  membershipVersion?: number;
}
export interface CreationRecord {
  _id: string;
  requestHash: string;
  userId: Types.ObjectId;
  weddingId: Types.ObjectId;
}
const schema = new Schema<WeddingRecord>(
  {
    displayNames: {
      partnerOne: { type: String, required: true },
      partnerTwo: { type: String, required: true },
      intro: { type: String, default: '' },
    },
    weddingDate: { type: String, required: true },
    defaultLocation: { name: { type: String, required: true } },
    timezone: { type: String, required: true },
    slug: { type: String, required: true },
    isPublished: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'archived', 'deleting'],
      default: 'active',
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    membershipVersion: { type: Number, default: 0 },
  },
  { collection: 'weddings', timestamps: true, autoIndex: false },
);
const creationSchema = new Schema<CreationRecord>(
  {
    _id: String,
    requestHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    weddingId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'weddingCreations', timestamps: true, autoIndex: false },
);
export const Wedding =
  (mongoose.models.Wedding as Model<WeddingRecord> | undefined) ??
  mongoose.model<WeddingRecord>('Wedding', schema);
export const WeddingCreation =
  (mongoose.models.WeddingCreation as Model<CreationRecord> | undefined) ??
  mongoose.model<CreationRecord>('WeddingCreation', creationSchema);
