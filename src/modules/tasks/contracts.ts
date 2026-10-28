import { z } from 'zod';
import { objectIdSchema } from '@/modules/memberships/contracts';
export const taskStatus = z.enum(['todo', 'inProgress', 'done']);
const fields = {
  title: z.string().trim().min(1, 'Enter a task title.').max(160),
  description: z.string().trim().max(2000),
  status: taskStatus,
  eventId: objectIdSchema.nullable(),
  assignedToUserId: objectIdSchema.nullable(),
  dueAt: z.iso.datetime().nullable(),
};
export const taskInput = z.strictObject({
  ...fields,
  description: fields.description.default(''),
  status: taskStatus.default('todo'),
  eventId: fields.eventId.default(null),
  assignedToUserId: fields.assignedToUserId.default(null),
  dueAt: fields.dueAt.default(null),
});
export const taskPatch = z
  .strictObject(fields)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide a field to update.',
  );
export const taskQuery = z
  .strictObject({
    status: taskStatus.optional(),
    assignedToUserId: z
      .union([objectIdSchema, z.literal('unassigned')])
      .optional(),
    eventId: z.union([objectIdSchema, z.literal('none')]).optional(),
    dueAfter: z.iso.datetime().optional(),
    dueBefore: z.iso.datetime().optional(),
    overdue: z.literal('true').optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) =>
      !v.dueAfter ||
      !v.dueBefore ||
      Date.parse(v.dueAfter) < Date.parse(v.dueBefore),
    'The end of the date range must follow its start.',
  );
export type TaskInput = z.infer<typeof taskInput>;
export type TaskQuery = z.infer<typeof taskQuery>;
export type TaskDto = TaskInput & {
  id: string;
  version: number;
  assignee: { state: 'active' | 'former' | 'unassigned'; name: string | null };
  event: { id: string; title: string } | null;
  overdue: boolean;
};
export const statusLabels = {
  todo: 'To Do',
  inProgress: 'In Progress',
  done: 'Completed',
} as const;
export function isOverdue(
  task: { status: string; dueAt: string | null },
  now: number,
) {
  return (
    task.status !== 'done' &&
    task.dueAt !== null &&
    Date.parse(task.dueAt) < now
  );
}
