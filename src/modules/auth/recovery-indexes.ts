export const recoveryIndexes = [
  {
    collection: 'passwordResetTokens',
    key: { tokenHash: 1 },
    name: 'password_reset_token_unique_v1',
    unique: true,
  },
  {
    collection: 'passwordResetTokens',
    key: { userId: 1, expiresAt: 1 },
    name: 'password_reset_user_v1',
  },
  {
    collection: 'passwordResetTokens',
    key: { expiresAt: 1 },
    name: 'password_reset_expiry_v1',
    expireAfterSeconds: 0,
  },
] as const;
