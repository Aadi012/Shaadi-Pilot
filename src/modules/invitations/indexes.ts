export const invitationIndexes = [
  {
    collection: 'guestInvitationLinks',
    key: { weddingId: 1, guestContactId: 1 },
    name: 'guest_link_contact_v1',
    unique: true,
  },
  {
    collection: 'eventInvitations',
    key: { weddingId: 1, eventId: 1, guestContactId: 1 },
    name: 'invitation_pair_v1',
    unique: true,
  },
  {
    collection: 'eventInvitations',
    key: { weddingId: 1, linkId: 1, revokedAt: 1 },
    name: 'invitation_link_v1',
  },
  {
    collection: 'guestInvitationSessions',
    key: { tokenHash: 1 },
    name: 'guest_session_hash_v1',
    unique: true,
  },
  {
    collection: 'guestInvitationSessions',
    key: { expiresAt: 1 },
    name: 'guest_session_expiry_v1',
    expireAfterSeconds: 0,
  },
] as const;
