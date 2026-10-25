// Shared by the explicit setup script and runtime readiness checks. Never drop indexes.
export const authIndexes = [
  {
    collection: 'users',
    key: { emailNormalized: 1 },
    name: 'users_email_unique_v1',
    unique: true,
  },
  {
    collection: 'sessions',
    key: { tokenHash: 1 },
    name: 'sessions_token_unique_v1',
    unique: true,
  },
  { collection: 'sessions', key: { userId: 1 }, name: 'sessions_user_v1' },
  {
    collection: 'sessions',
    key: { expiresAt: 1 },
    name: 'sessions_expiry_v1',
    expireAfterSeconds: 0,
  },
  {
    collection: 'authRateLimits',
    key: { expiresAt: 1 },
    name: 'auth_limits_expiry_v1',
    expireAfterSeconds: 0,
  },
] as const;
