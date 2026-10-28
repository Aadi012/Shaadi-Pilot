export const guestIndexes = [
  {
    collection: 'guestContacts',
    key: { weddingId: 1, archivedAt: 1, _id: -1 },
    name: 'guests_list_v1',
  },
  {
    collection: 'guestContacts',
    key: { weddingId: 1, archivedAt: 1, emailNormalized: 1 },
    name: 'guests_email_v1',
  },
  {
    collection: 'guestContacts',
    key: { weddingId: 1, selectedEventIds: 1 },
    name: 'guests_functions_v1',
  },
] as const;
