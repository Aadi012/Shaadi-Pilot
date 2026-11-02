export const expenseIndexes = [
  {
    collection: 'expenses',
    key: { weddingId: 1, archivedAt: 1, _id: -1 },
    name: 'expense_list_v1',
  },
  {
    collection: 'expenses',
    key: { weddingId: 1, eventId: 1, paidAt: 1 },
    name: 'expense_event_date_v1',
  },
] as const;
