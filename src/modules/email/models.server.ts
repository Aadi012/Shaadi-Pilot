import 'server-only';
import mongoose, { Schema, type Model, type Types } from 'mongoose';
export type DeliveryState =
  | 'pending'
  | 'leased'
  | 'retry'
  | 'submitted'
  | 'failed'
  | 'cancelled'
  | 'quarantined';
export interface DeliveryRecord {
  _id: Types.ObjectId;
  scope: 'platform';
  kind: 'password-reset';
  userId: Types.ObjectId;
  tokenHash: string;
  logicalKey: string;
  state: DeliveryState;
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  leaseOwner: string | null;
  expiresAt: Date;
  purgeAt: Date;
  firstAttemptAt?: Date;
  providerMessageId?: string;
  lastError?: string;
}
export interface BatchRecord {
  _id: Types.ObjectId;
  idempotencyKey: string;
  payloadHash: string;
  encrypted?: { keyId: string; iv: string; tag: string; ciphertext: string };
  expiresAt: Date;
}
const deliverySchema = new Schema<DeliveryRecord>(
  {
    scope: { type: String, required: true },
    kind: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, select: false },
    logicalKey: { type: String, required: true },
    state: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true },
    leaseUntil: { type: Date, default: null },
    leaseOwner: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
    firstAttemptAt: Date,
    providerMessageId: String,
    lastError: String,
  },
  { collection: 'emailDeliveries', timestamps: true, autoIndex: false },
);
const batchSchema = new Schema<BatchRecord>(
  {
    idempotencyKey: { type: String, required: true },
    payloadHash: { type: String, required: true },
    encrypted: {
      type: new Schema(
        { keyId: String, iv: String, tag: String, ciphertext: String },
        { _id: false },
      ),
      select: false,
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'emailBatches', timestamps: true, autoIndex: false },
);
export const EmailDelivery =
  (mongoose.models.EmailDelivery as Model<DeliveryRecord> | undefined) ??
  mongoose.model<DeliveryRecord>('EmailDelivery', deliverySchema);
export const EmailBatch =
  (mongoose.models.EmailBatch as Model<BatchRecord> | undefined) ??
  mongoose.model<BatchRecord>('EmailBatch', batchSchema);
