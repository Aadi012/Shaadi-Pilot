import 'server-only';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface UserRecord {
  _id: Types.ObjectId;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  weddingId: Types.ObjectId | null;
  role: 'admin' | 'manager' | null;
  status: 'active' | 'disabled';
  lastLoginAt: Date | null;
}
export interface SessionRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}
interface RateRecord {
  _id: string;
  count: number;
  expiresAt: Date;
}
const userSchema = new Schema<UserRecord>(
  {
    emailNormalized: { type: String, required: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    weddingId: { type: Schema.Types.ObjectId, default: null },
    role: { type: String, enum: ['admin', 'manager', null], default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
  },
  { collection: 'users', timestamps: true, autoIndex: false },
);
const sessionSchema = new Schema<SessionRecord>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, select: false },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: 'sessions', autoIndex: false },
);
const rateSchema = new Schema<RateRecord>(
  {
    _id: String,
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'authRateLimits', autoIndex: false },
);
export const User =
  (mongoose.models.AuthUser as Model<UserRecord> | undefined) ??
  mongoose.model<UserRecord>('AuthUser', userSchema);
export const Session =
  (mongoose.models.AuthSession as Model<SessionRecord> | undefined) ??
  mongoose.model<SessionRecord>('AuthSession', sessionSchema);
export const RateLimit =
  (mongoose.models.AuthRateLimit as Model<RateRecord> | undefined) ??
  mongoose.model<RateRecord>('AuthRateLimit', rateSchema);
