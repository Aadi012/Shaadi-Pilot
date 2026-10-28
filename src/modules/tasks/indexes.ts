export const taskIndexes = [
  {
    collection: 'tasks',
    key: { weddingId: 1, archivedAt: 1, _id: -1 },
    name: 'tasks_list_v1',
  },
  {
    collection: 'tasks',
    key: { weddingId: 1, archivedAt: 1, status: 1, dueAt: 1 },
    name: 'tasks_due_v1',
  },
  {
    collection: 'tasks',
    key: { weddingId: 1, archivedAt: 1, assignedToUserId: 1, _id: -1 },
    name: 'tasks_assignee_v1',
  },
  {
    collection: 'tasks',
    key: { weddingId: 1, eventId: 1 },
    name: 'tasks_event_v1',
  },
] as const;
