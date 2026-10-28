import { describe, it, expect } from 'vitest';
import {
  taskInput,
  taskPatch,
  taskQuery,
  isOverdue,
} from '@/modules/tasks/contracts';
import {
  readTaskDraft,
  readTaskFilters,
} from '@/components/workspace/task-draft';
import { prepareCreate } from '@/lib/api/create-attempt';
describe('Task contracts and browser drafts', () => {
  it('defaults optional fields without accepting extra fields or invalid references', () => {
    expect(taskInput.parse({ title: ' Call photographer ' })).toEqual({
      title: 'Call photographer',
      description: '',
      status: 'todo',
      dueAt: null,
      eventId: null,
      assignedToUserId: null,
    });
    expect(
      taskInput.safeParse({ title: 'Task', priority: 'high' }).success,
    ).toBe(false);
    expect(
      taskInput.safeParse({ title: 'Task', eventId: 'foreign' }).success,
    ).toBe(false);
    expect(taskPatch.safeParse({}).success).toBe(false);
    expect(taskPatch.parse({ assignedToUserId: null })).toEqual({
      assignedToUserId: null,
    });
  });
  it('captures populated due dates before controls are disabled and does not mutate failures', () => {
    const fields = new FormData();
    fields.set('title', 'Call venue');
    fields.set('description', 'Confirm access');
    fields.set('status', 'todo');
    fields.set('dueAt', '2027-03-13T19:30');
    const data = readTaskDraft(fields, 'Asia/Kolkata');
    expect(data.dueAt).toBe('2027-03-13T14:00:00.000Z');
    fields.set('title', 'Later draft');
    expect(data.title).toBe('Call venue');
    fields.set('dueAt', 'bad');
    expect(() => readTaskDraft(fields, 'Asia/Kolkata')).toThrow();
    expect(fields.get('title')).toBe('Later draft');
  });
  it('allows no deadline, rejects DST ambiguity and uses explicit overdue boundaries', () => {
    expect(isOverdue({ status: 'todo', dueAt: null }, Date.now())).toBe(false);
    const dueAt = '2026-10-28T10:00:00Z',
      now = Date.parse(dueAt);
    expect(isOverdue({ status: 'todo', dueAt }, now)).toBe(false);
    expect(isOverdue({ status: 'todo', dueAt }, now + 1)).toBe(true);
    expect(isOverdue({ status: 'done', dueAt }, now + 1)).toBe(false);
    const fields = new FormData();
    fields.set('title', 'Call');
    fields.set('description', '');
    fields.set('status', 'todo');
    expect(readTaskDraft(fields, 'Asia/Kolkata').dueAt).toBe(null);
    fields.set('dueAt', '2026-11-01T01:30');
    expect(() => readTaskDraft(fields, 'America/New_York')).toThrow(/repeated/);
  });
  it('converts deadline filter ranges and rejects unknown or oversized filters', () => {
    const fields = new FormData();
    fields.set('dueAfter', '2027-03-13T00:00');
    fields.set('overdue', 'true');
    expect(
      new URLSearchParams(readTaskFilters(fields, 'Asia/Kolkata')).get(
        'dueAfter',
      ),
    ).toBe('2027-03-12T18:30:00.000Z');
    expect(taskQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(taskQuery.safeParse({ nonsense: 1 }).success).toBe(false);
  });
  it('reuses a create key after uncertain delivery and prevents changing the payload', () => {
    const attempt = prepareCreate(null, { title: 'Task' });
    expect(prepareCreate(attempt, { title: 'Task' })).toBe(attempt);
    expect(() => prepareCreate(attempt, { title: 'Changed' })).toThrow(
      /previous save/,
    );
    expect(prepareCreate(null, { title: 'Task' }).key).not.toBe(attempt.key);
  });
});
