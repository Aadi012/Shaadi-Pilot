'use client';
import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';
import { WorkspaceShell } from './workspace-shell';
import type { WeddingDto } from '@/modules/weddings/contracts';
import type { EventDto } from '@/modules/events/contracts';
import {
  statusLabels,
  type TaskDto,
  type TaskInput,
} from '@/modules/tasks/contracts';
import { wallTime } from '@/modules/events/time';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { readTaskDraft, readTaskFilters } from './task-draft';
import styles from './tasks.module.css';
import shared from './team.module.css';
import form from './workspace.module.css';
type Summary = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  assigned: number;
  unassigned: number;
};
type Member = { id: string; name: string };
async function responseData(response: Response) {
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ?? 'Could not complete this request. Try again.',
    );
  return result.data;
}
export function Tasks({
  wedding,
  name,
  role,
  userId,
  initialList,
  initialMembers,
  initialEvents,
  initialFilter,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
  initialList: {
    tasks: TaskDto[];
    summary: Summary;
    nextCursor: string | null;
  };
  initialMembers: { members: Member[]; nextCursor: string | null };
  initialEvents: { events: EventDto[]; nextCursor: string | null };
  initialFilter: string;
}) {
  const [rows, setRows] = useState<TaskDto[]>(initialList.tasks),
    [summary, setSummary] = useState(initialList.summary),
    [filters, setFilters] = useState(initialFilter),
    [cursor, setCursor] = useState<string | null>(initialList.nextCursor);
  const [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<TaskDto | null>(null),
    [editing, setEditing] = useState(false),
    [generation, setGeneration] = useState(0);
  const [members, setMembers] = useState<Member[]>(initialMembers.members),
    [events, setEvents] = useState<EventDto[]>(initialEvents.events),
    [memberCursor, setMemberCursor] = useState<string | null>(
      initialMembers.nextCursor,
    ),
    [eventCursor, setEventCursor] = useState<string | null>(
      initialEvents.nextCursor,
    ),
    [modalOpen, setModalOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    fields = useRef<HTMLFormElement>(null),
    busy = useRef(false),
    sequence = useRef(0),
    creation = useRef<CreateAttempt<TaskInput> | null>(null);
  const verifyTenant = useCallback(
    (data: { weddingId: string; timezone?: string }) => {
      if (
        data.weddingId !== wedding.id ||
        (data.timezone && data.timezone !== wedding.timezone)
      )
        throw new Error(
          'Your wedding details changed. Reload this workspace before continuing.',
        );
    },
    [wedding.id, wedding.timezone],
  );
  const load = useCallback(
    async (query: string, after?: string | null) => {
      const attempt = ++sequence.current;
      setLoading(true);
      try {
        const params = new URLSearchParams(query);
        if (after) params.set('cursor', after);
        const data = await responseData(
          await fetch('/api/v1/tasks?' + params, { cache: 'no-store' }),
        );
        verifyTenant(data);
        if (attempt !== sequence.current) return;
        setRows((previous) =>
          after ? [...previous, ...data.tasks] : data.tasks,
        );
        setCursor(data.nextCursor);
        setSummary(data.summary);
        setError('');
      } catch (e) {
        if (attempt === sequence.current)
          setError(e instanceof Error ? e.message : 'Could not load tasks.');
      } finally {
        if (attempt === sequence.current) setLoading(false);
      }
    },
    [verifyTenant],
  );
  const loadMembers = useCallback(
    async (after?: string | null) => {
      const data = await responseData(
        await fetch(
          '/api/v1/tasks/options' + (after ? '?cursor=' + after : ''),
          { cache: 'no-store' },
        ),
      );
      verifyTenant(data);
      setMembers((previous) =>
        after ? [...previous, ...data.members] : data.members,
      );
      setMemberCursor(data.nextCursor);
    },
    [verifyTenant],
  );
  const loadEvents = useCallback(
    async (after?: string | null) => {
      const data = await responseData(
        await fetch(
          '/api/v1/events' +
            (after ? '?cursor=' + encodeURIComponent(after) : ''),
          { cache: 'no-store' },
        ),
      );
      verifyTenant(data);
      setEvents((previous) =>
        after ? [...previous, ...data.events] : data.events,
      );
      setEventCursor(data.nextCursor);
    },
    [verifyTenant],
  );
  function open(row: TaskDto | null, edit: boolean) {
    creation.current = null;
    setSelected(row);
    setEditing(edit);
    setGeneration((v) => v + 1);
    setError('');
    setModalOpen(true);
    dialog.current?.showModal();
  }
  function discard() {
    if (
      !pending &&
      (!editing ||
        window.confirm(
          creation.current
            ? 'A previous save may have succeeded. Discard this draft and refresh the list before creating another task?'
            : 'Discard unsaved task changes?',
        ))
    ) {
      dialog.current?.close();
      void load(filters);
    }
  }
  async function write(archive = false, status?: TaskInput['status']) {
    if (busy.current) return;
    let body: TaskInput | { status: TaskInput['status'] } | undefined;
    try {
      if (!archive)
        body = status
          ? { status }
          : readTaskDraft(new FormData(fields.current!), wedding.timezone);
      if (!archive && !selected)
        creation.current = prepareCreate(creation.current, body as TaskInput);
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : 'Check the task fields.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const session = await responseData(
        await fetch('/api/v1/auth/session', { cache: 'no-store' }),
      );
      if (session.user?.id !== userId || session.user?.weddingId !== wedding.id)
        throw new Error(
          'Your account or wedding changed. Reload before saving.',
        );
      const data = await responseData(
        await fetch('/api/v1/tasks' + (selected ? '/' + selected.id : ''), {
          method: archive ? 'DELETE' : selected ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrfToken,
            'X-Wedding-Context': wedding.id,
            ...(selected
              ? { 'If-Match': '"' + selected.version + '"' }
              : { 'Idempotency-Key': creation.current!.key }),
          },
          ...(archive ? {} : { body: JSON.stringify(body) }),
        }),
      );
      creation.current = null;
      if (status) {
        setSelected(data.task);
      } else dialog.current?.close();
      setNotice(archive ? 'Task removed.' : 'Task saved.');
      await load(filters);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save. Your draft is kept.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function latest() {
    if (
      !selected ||
      pending ||
      !window.confirm('Discard your draft and load the latest task details?')
    )
      return;
    try {
      const data = await responseData(
        await fetch('/api/v1/tasks/' + selected.id, { cache: 'no-store' }),
      );
      verifyTenant(data);
      setSelected(data.task);
      setGeneration((v) => v + 1);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reload task.');
    }
  }
  const due = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: wedding.timezone,
        }).format(new Date(value))
      : 'No deadline';
  const assignee = (task: TaskDto) =>
    task.assignee.state === 'former'
      ? 'Former organizer — reassign'
      : (task.assignee.name ?? 'Unassigned');
  const initialEvent = new URLSearchParams(filters).get('eventId') ?? '';
  return (
    <WorkspaceShell wedding={wedding} name={name} role={role} active="Tasks">
      <div className={shared.container}>
        <div className={shared.heading}>
          <div>
            <p className={form.eyebrow}>A little structure for every detail</p>
            <h1>Wedding Tasks & Checklists</h1>
            <p>Keep responsibilities, deadlines and celebrations together.</p>
          </div>
          <button
            className={form.primaryButton}
            disabled={pending}
            onClick={() => open(null, true)}
          >
            Create Task
          </button>
        </div>
        {notice && (
          <p role="status" className={shared.notice}>
            {notice}
          </p>
        )}
        {error && !modalOpen && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        <section className={styles.summary} aria-label="Wedding task summary">
          {[
            {
              label: 'Total tasks',
              value: summary.total,
              copy: `${summary.done} completed`,
            },
            {
              label: 'Overdue',
              value: summary.overdue,
              copy: 'Incomplete and past their deadline',
            },
            {
              label: 'Assigned to me',
              value: summary.assigned,
              copy: 'Your incomplete tasks',
            },
            {
              label: 'Unassigned',
              value: summary.unassigned,
              copy: 'Ready to delegate',
            },
          ].map((item) => (
            <article key={item.label}>
              <h2>{item.label}</h2>
              <strong>{item.value}</strong>
              <p>{item.copy}</p>
            </article>
          ))}
        </section>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const query = readTaskFilters(
                new FormData(e.currentTarget),
                wedding.timezone,
              );
              setFilters(query);
              void load(query);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Check the filters.');
            }
          }}
        >
          <div className={styles.filterGrid}>
            <label>
              Status
              <select name="status">
                <option value="">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select name="assignedToUserId">
                <option value="">All organizers</option>
                <option value={userId}>Assigned to me</option>
                <option value="unassigned">Unassigned</option>
                {members
                  .filter((m) => m.id !== userId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Function
              <select
                name="eventId"
                key={initialEvent}
                defaultValue={initialEvent}
              >
                <option value="">All functions</option>
                <option value="none">No function</option>
                {initialEvent &&
                  !events.some((e) => e.id === initialEvent) &&
                  initialEvent !== 'none' && (
                    <option value={initialEvent}>Selected function</option>
                  )}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Deadlines
              <select name="overdue">
                <option value="">All deadlines</option>
                <option value="true">Overdue only</option>
              </select>
            </label>
          </div>
          <details>
            <summary>Filter by due date and time · {wedding.timezone}</summary>
            <div className={styles.filterGrid}>
              <label>
                Due on or after
                <input name="dueAfter" type="datetime-local" />
              </label>
              <label>
                Due before
                <input name="dueBefore" type="datetime-local" />
              </label>
            </div>
          </details>
          <div className={styles.toolbar}>
            <button
              className={form.primaryButton}
              disabled={pending || loading}
            >
              Apply filters
            </button>
            <button
              type="reset"
              className={form.textButton}
              onClick={() => {
                setFilters('');
                void load('');
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className={form.textButton}
              disabled={loading}
              onClick={() => void load(filters)}
            >
              Refresh tasks
            </button>
          </div>
        </form>
        <div aria-busy={loading} className={styles.registry}>
          <div className={styles.tableHeading}>
            <span>Task title & scope</span>
            <span>Status</span>
            <span>Assignee</span>
            <span>Function</span>
            <span>Due date</span>
            <span>Actions</span>
          </div>
          {loading && <p role="status">Loading tasks…</p>}
          {!loading && rows.length === 0 && (
            <div className={shared.empty}>
              <h2>
                {filters
                  ? 'No tasks match these filters'
                  : 'A thoughtful plan starts with one task'}
              </h2>
              <p>
                {filters
                  ? 'Try another status, organizer or date range.'
                  : 'Add your first task and give every detail a place.'}
              </p>
            </div>
          )}
          {rows.map((task) => (
            <article
              className={`${styles.taskRow} ${task.overdue ? styles.overdue : ''}`}
              key={task.id}
            >
              <div>
                <h2
                  className={
                    task.status === 'done' ? styles.completed : undefined
                  }
                >
                  {task.title}
                </h2>
                <p>{task.description}</p>
              </div>
              <div>
                <span className={styles.badge}>
                  {statusLabels[task.status]}
                </span>
                {task.overdue && (
                  <strong className={styles.warning}>Overdue</strong>
                )}
              </div>
              <p>{assignee(task)}</p>
              <p>
                {task.event?.title ??
                  (task.eventId ? 'Unavailable function' : 'No function')}
              </p>
              <p>{due(task.dueAt)}</p>
              <div className={styles.rowActions}>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => open(task, false)}
                >
                  Details<span className={form.srOnly}> for {task.title}</span>
                </button>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => open(task, true)}
                >
                  Edit<span className={form.srOnly}> {task.title}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        {cursor && (
          <button
            className={form.textButton}
            disabled={loading}
            onClick={() => void load(filters, cursor)}
          >
            Load more tasks
          </button>
        )}
        <dialog
          ref={dialog}
          className={`${shared.dialog} ${styles.taskDialog}`}
          aria-labelledby="task-title"
          onClose={() => {
            setModalOpen(false);
            fields.current?.reset();
            setGeneration((v) => v + 1);
          }}
          onCancel={(e) => {
            e.preventDefault();
            discard();
          }}
        >
          <p className={form.eyebrow}>Shared wedding planning</p>
          <h2 id="task-title">
            {editing
              ? selected
                ? 'Edit Task'
                : 'Create Task'
              : selected?.title}
          </h2>
          {error && (
            <div role="alert" className={form.errorNotice}>
              <p>{error}</p>
              {selected && (
                <button
                  type="button"
                  disabled={pending}
                  className={form.textButton}
                  onClick={() => void latest()}
                >
                  Load latest details
                </button>
              )}
            </div>
          )}
          {editing ? (
            <form
              ref={fields}
              key={generation}
              onSubmit={(e) => {
                e.preventDefault();
                void write();
              }}
            >
              <fieldset className={form.formFields} disabled={pending}>
                <legend className={form.srOnly}>Task details</legend>
                <div className={form.field}>
                  <label htmlFor="task-name">Task title</label>
                  <input
                    name="title"
                    id="task-name"
                    maxLength={160}
                    required
                    defaultValue={selected?.title ?? ''}
                  />
                </div>
                <div className={form.field}>
                  <label htmlFor="task-description">
                    Description (optional)
                  </label>
                  <textarea
                    name="description"
                    id="task-description"
                    maxLength={2000}
                    rows={4}
                    defaultValue={selected?.description ?? ''}
                  />
                </div>
                <div className={styles.filterGrid}>
                  <div className={form.field}>
                    <label htmlFor="task-event">Function (optional)</label>
                    <select
                      name="eventId"
                      id="task-event"
                      defaultValue={selected?.eventId ?? initialEvent}
                    >
                      <option value="">No function</option>
                      {selected?.eventId &&
                        !events.some((e) => e.id === selected.eventId) && (
                          <option value={selected.eventId}>
                            {selected.event?.title ?? 'Current function'}
                          </option>
                        )}
                      {events.map((event) => (
                        <option value={event.id} key={event.id}>
                          {event.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={form.field}>
                    <label htmlFor="task-assignee">Assignee (optional)</label>
                    <select
                      name="assignedToUserId"
                      id="task-assignee"
                      defaultValue={selected?.assignedToUserId ?? ''}
                    >
                      <option value="">Unassigned</option>
                      {selected?.assignedToUserId &&
                        !members.some(
                          (m) => m.id === selected.assignedToUserId,
                        ) && (
                          <option value={selected.assignedToUserId}>
                            {assignee(selected)}
                          </option>
                        )}
                      {members.map((member) => (
                        <option value={member.id} key={member.id}>
                          {selected?.assignedToUserId === member.id &&
                          selected.assignee.state === 'former'
                            ? 'Former organizer — clear to reassign'
                            : member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={form.field}>
                  <label htmlFor="task-due">
                    Due date and time (optional) · {wedding.timezone}
                  </label>
                  <input
                    id="task-due"
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={
                      selected?.dueAt
                        ? wallTime(selected.dueAt, wedding.timezone)
                        : ''
                    }
                  />
                  <small>Leave blank for no deadline.</small>
                </div>
                <div className={form.field}>
                  <label htmlFor="task-status">Status</label>
                  <select
                    id="task-status"
                    name="status"
                    defaultValue={selected?.status ?? 'todo'}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.toolbar}>
                  {memberCursor && (
                    <button
                      type="button"
                      className={form.textButton}
                      onClick={() =>
                        void loadMembers(memberCursor).catch(() =>
                          setError('Could not load more organizers.'),
                        )
                      }
                    >
                      Load more organizers
                    </button>
                  )}
                  {eventCursor && (
                    <button
                      type="button"
                      className={form.textButton}
                      onClick={() =>
                        void loadEvents(eventCursor).catch(() =>
                          setError('Could not load more functions.'),
                        )
                      }
                    >
                      Load more functions
                    </button>
                  )}
                </div>
                <p className={styles.help}>
                  Admins and Managers can assign tasks to any active organizer.
                  Unsaved changes stay in this tab while a save fails.
                </p>
                <div className={shared.actions}>
                  <button
                    type="button"
                    className={form.textButton}
                    onClick={discard}
                  >
                    Cancel
                  </button>
                  <button className={form.primaryButton} type="submit">
                    {pending ? 'Saving…' : 'Save task'}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            selected && (
              <>
                <div className={styles.detailMeta}>
                  <span className={styles.badge}>
                    {statusLabels[selected.status]}
                  </span>
                  {selected.overdue && (
                    <strong className={styles.warning}>Overdue</strong>
                  )}
                </div>
                <h3>Description</h3>
                <p className={styles.description}>
                  {selected.description || 'No description added.'}
                </p>
                <dl>
                  <dt>Assignee</dt>
                  <dd>{assignee(selected)}</dd>
                  <dt>Function</dt>
                  <dd>{selected.event?.title ?? 'No function'}</dd>
                  <dt>Deadline · {wedding.timezone}</dt>
                  <dd>{due(selected.dueAt)}</dd>
                </dl>
                <div className={styles.toolbar}>
                  {Object.entries(statusLabels)
                    .filter(([value]) => value !== selected.status)
                    .map(([value, label]) => (
                      <button
                        key={value}
                        disabled={pending}
                        className={form.textButton}
                        onClick={() =>
                          void write(false, value as TaskInput['status'])
                        }
                      >
                        Mark {label}
                      </button>
                    ))}
                </div>
                <div className={shared.actions}>
                  <button
                    className={form.textButton}
                    disabled={pending}
                    onClick={discard}
                  >
                    Close
                  </button>
                  <button
                    className={form.primaryButton}
                    disabled={pending}
                    onClick={() => setEditing(true)}
                  >
                    Edit task
                  </button>
                  <button
                    className={form.textButton}
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this task from active planning? Its history will be retained.',
                        )
                      )
                        void write(true);
                    }}
                  >
                    Remove task
                  </button>
                </div>
              </>
            )
          )}
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
