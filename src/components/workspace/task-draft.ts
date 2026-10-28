import { taskInput } from '@/modules/tasks/contracts';
import { utcTime } from '@/modules/events/time';
export function readTaskDraft(fields: FormData, timezone: string) {
  const due = String(fields.get('dueAt') ?? '');
  return taskInput.parse({
    title: fields.get('title'),
    description: fields.get('description'),
    status: fields.get('status'),
    assignedToUserId: fields.get('assignedToUserId') || null,
    eventId: fields.get('eventId') || null,
    dueAt: due ? utcTime(due, timezone) : null,
  });
}
export function readTaskFilters(fields: FormData, timezone: string) {
  const params = new URLSearchParams();
  for (const name of ['status', 'assignedToUserId', 'eventId', 'overdue']) {
    const value = String(fields.get(name) ?? '');
    if (value) params.set(name, value);
  }
  for (const name of ['dueAfter', 'dueBefore']) {
    const value = String(fields.get(name) ?? '');
    if (value) params.set(name, utcTime(value, timezone));
  }
  return params.toString();
}
