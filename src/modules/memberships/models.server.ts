import 'server-only';
import mongoose, { Schema, type Model, type Types } from 'mongoose';
export interface InviteRecord {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  emailNormalized: string;
  invitedRole: 'manager';
  invitedBy: Types.ObjectId;
  tokenHash: string;
  state: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
  consumedBy: Types.ObjectId | null;
  revokedAt: Date | null;
  deliveryId: Types.ObjectId;
}
export interface InviteRequestRecord {
  _id: string;
  weddingId: Types.ObjectId;
  requestHash: string;
  invitationId: Types.ObjectId;
}
const schema = new Schema<InviteRecord>(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    emailNormalized: { type: String, required: true },
    invitedRole: { type: String, enum: ['manager'], required: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, select: false },
    state: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    consumedBy: { type: Schema.Types.ObjectId, default: null },
    revokedAt: { type: Date, default: null },
    deliveryId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'memberInvites', timestamps: true, autoIndex: false },
);
const requestSchema = new Schema<InviteRequestRecord>(
  {
    _id: String,
    weddingId: { type: Schema.Types.ObjectId, required: true },
    requestHash: { type: String, required: true },
    invitationId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'memberInviteRequests', timestamps: true, autoIndex: false },
);
export const MemberInvite =
  (mongoose.models.MemberInvite as Model<InviteRecord> | undefined) ??
  mongoose.model<InviteRecord>('MemberInvite', schema);
export const MemberInviteRequest =
  (mongoose.models.MemberInviteRequest as
    Model<InviteRequestRecord> | undefined) ??
  mongoose.model<InviteRequestRecord>('MemberInviteRequest', requestSchema);
