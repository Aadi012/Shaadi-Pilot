export const membershipIndexes = [
  {
    collection: 'memberInvites',
    key: { tokenHash: 1 },
    name: 'member_invite_token_unique_v1',
    unique: true,
  },
  {
    collection: 'memberInvites',
    key: { weddingId: 1, emailNormalized: 1 },
    name: 'member_invite_pending_unique_v1',
    unique: true,
    partialFilterExpression: { state: 'pending' },
  },
  {
    collection: 'memberInvites',
    key: { weddingId: 1, _id: 1 },
    name: 'member_invite_wedding_v1',
  },
  {
    collection: 'memberInviteRequests',
    key: { weddingId: 1 },
    name: 'member_invite_request_wedding_v1',
  },
  {
    collection: 'users',
    key: { weddingId: 1, _id: 1 },
    name: 'users_wedding_members_v1',
  },
] as const;
