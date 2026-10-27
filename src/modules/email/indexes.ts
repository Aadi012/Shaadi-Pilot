export const emailIndexes = [
  {
    collection: 'emailDeliveries',
    key: { logicalKey: 1 },
    name: 'email_logical_unique_v1',
    unique: true,
  },
  {
    collection: 'emailDeliveries',
    key: { state: 1, nextAttemptAt: 1, leaseUntil: 1 },
    name: 'email_due_v1',
  },
  {
    collection: 'emailDeliveries',
    key: { purgeAt: 1 },
    name: 'email_purge_v1',
    expireAfterSeconds: 0,
  },
  {
    collection: 'emailBatches',
    key: { idempotencyKey: 1 },
    name: 'email_batch_unique_v1',
    unique: true,
  },
  {
    collection: 'emailBatches',
    key: { expiresAt: 1 },
    name: 'email_batch_expiry_v1',
    expireAfterSeconds: 0,
  },
] as const;
