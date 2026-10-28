'use client';
import { useEffect, useRef, useState } from 'react';
import { WorkspaceShell } from './workspace-shell';
import type { WeddingDto } from '@/modules/weddings/contracts';
import { type EventDto } from '@/modules/events/contracts';
import { wallTime } from '@/modules/events/time';
import { readFunctionDraft } from './function-draft';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import type { TaskDto } from '@/modules/tasks/contracts';
import Link from 'next/link';
import styles from './team.module.css';
import form from './workspace.module.css';
export function Functions({
  wedding,
  name,
  role,
  userId,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
}) {
  const [rows, setRows] = useState<EventDto[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState<EventDto | null>(null),
    [editing, setEditing] = useState(false),
    [notice, setNotice] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [formGeneration, setFormGeneration] = useState(0);
  const [linkedTasks, setLinkedTasks] = useState<TaskDto[]>([]);
  const [taskError, setTaskError] = useState('');
  useEffect(() => {
    if (!selected || editing) return;
    let active = true;
    void fetch('/api/v1/tasks?eventId=' + selected.id + '&limit=5', {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const { data } = await response.json();
        if (data.weddingId !== wedding.id) throw new Error();
        if (active) {
          setLinkedTasks(data.tasks);
          setTaskError('');
        }
      })
      .catch(() => {
        if (active)
          setTaskError(
            'Could not load related tasks. Reopen these details to retry.',
          );
      });
    return () => {
      active = false;
    };
  }, [selected, editing, wedding.id]);
  const creation = useRef<CreateAttempt<
    ReturnType<typeof readFunctionDraft>
  > | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    fields = useRef<HTMLFormElement>(null);
  async function load(append = false) {
    const r = await fetch(
      '/api/v1/events' +
        (append && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      { cache: 'no-store' },
    );
    if (!r.ok) throw new Error('Could not load functions. Try again.');
    const { data } = await r.json();
    if (data.weddingId !== wedding.id)
      throw new Error('Your wedding changed. Reload this workspace.');
    setRows((previous) =>
      append ? [...previous, ...data.events] : data.events,
    );
    setCursor(data.nextCursor);
  }
  useEffect(() => {
    let active = true;
    void fetch('/api/v1/events', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load functions.');
        const { data } = await response.json();
        if (data.weddingId !== wedding.id)
          throw new Error('Your wedding changed. Reload.');
        if (active) {
          setRows(data.events);
          setCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [wedding.id]);
  function open(row: EventDto | null, edit: boolean) {
    creation.current = null;
    setFormGeneration((value) => value + 1);
    setSelected(row);
    setLinkedTasks([]);
    setTaskError('');
    setEditing(edit);
    setError('');
    dialog.current?.showModal();
  }
  function discard() {
    if (pending) return;
    if (
      editing &&
      !window.confirm(
        creation.current
          ? 'The previous save may have succeeded. Discard this draft and refresh before adding another function?'
          : 'Discard any unsaved changes?',
      )
    )
      return;
    dialog.current?.close();
    void load().catch(() =>
      setError('Could not refresh functions. Refresh before creating another.'),
    );
  }
  async function write(archive = false) {
    if (busy.current) return;
    let body;
    try {
      // Capture controls synchronously, before pending disables the fieldset.
      if (!archive) body = readFunctionDraft(new FormData(fields.current!));
      if (!archive && !selected)
        creation.current = prepareCreate(creation.current, body!);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Check the form fields.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const r = await fetch('/api/v1/auth/session', { cache: 'no-store' });
      if (!r.ok) throw new Error('Could not refresh your session.');
      const { data } = await r.json();
      if (data.user?.id !== userId || data.user?.weddingId !== wedding.id)
        throw new Error(
          'Your account or wedding changed. Reload before saving.',
        );
      const response = await fetch(
        '/api/v1/events' + (selected ? '/' + selected.id : ''),
        {
          method: archive ? 'DELETE' : selected ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': data.csrfToken,
            'X-Wedding-Context': wedding.id,
            ...(selected ? { 'If-Match': `"${selected.version}"` } : {}),
            ...(!selected && creation.current
              ? { 'Idempotency-Key': creation.current.key }
              : {}),
          },
          ...(archive ? {} : { body: JSON.stringify(body) }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 412
            ? 'Someone changed this function. Your draft is kept. Cancel and reopen the latest details before saving.'
            : (result.error?.message ?? 'Could not save function.'),
        );
      dialog.current?.close();
      setNotice(archive ? 'Function removed.' : 'Function saved.');
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Check the form and try again.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const date = (row: EventDto) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: row.timezone,
    }).format(new Date(row.startsAt));
  return (
    <WorkspaceShell
      wedding={wedding}
      name={name}
      role={role}
      active="Functions"
    >
      <div className={styles.container}>
        <div className={styles.heading}>
          <div>
            <p className={form.eyebrow}>
              Planning dashboard · Your celebrations
            </p>
            <h1>Wedding Functions</h1>
            <p>
              Each celebration, thoughtfully planned in its own time and place.
            </p>
          </div>
          {cursor && (
            <button
              className={form.textButton}
              disabled={pending}
              onClick={() => void load(true).catch((e) => setError(e.message))}
            >
              Load more functions
            </button>
          )}
          <button
            className={form.primaryButton}
            disabled={loading || pending}
            onClick={() => open(null, true)}
          >
            Add Function
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading functions…</p>
        ) : rows.length === 0 ? (
          <section className={styles.panel}>
            <h2>Your first celebration starts here</h2>
            <p>Add a function to begin your wedding schedule.</p>
          </section>
        ) : (
          rows.map((row) => (
            <article key={row.id} className={styles.panel}>
              <p className={form.eyebrow}>{date(row)}</p>
              <h2>{row.title}</h2>
              <p>
                {row.venue.name} · {row.timezone}
              </p>
              <div className={styles.actions}>
                <button
                  className={form.textButton}
                  onClick={() => open(row, true)}
                >
                  Edit {row.title}
                </button>
                <button
                  className={form.primaryButton}
                  onClick={() => open(row, false)}
                >
                  View details
                </button>
              </div>
            </article>
          ))
        )}
        <button
          className={form.textButton}
          disabled={pending}
          onClick={() => {
            setError('');
            void load().catch((e) => setError(e.message));
          }}
        >
          Refresh functions
        </button>
        <dialog
          ref={dialog}
          className={`${styles.dialog} ${styles.functionDrawer}`}
          aria-labelledby="function-title"
          onClose={() => {
            fields.current?.reset();
            setFormGeneration((value) => value + 1);
          }}
          onCancel={(e) => {
            e.preventDefault();
            discard();
          }}
        >
          <h2 id="function-title">
            {editing
              ? selected
                ? 'Edit Function'
                : 'Create Function'
              : selected?.title}
          </h2>
          {error && (
            <p role="alert" className={form.errorNotice}>
              {error}
            </p>
          )}
          {editing ? (
            <form
              key={formGeneration}
              ref={fields}
              onSubmit={(e) => {
                e.preventDefault();
                void write();
              }}
            >
              <fieldset disabled={pending} className={form.formFields}>
                <legend className={form.srOnly}>Function details</legend>
                {[
                  [
                    'title',
                    'Function name',
                    'text',
                    selected?.title ?? '',
                    100,
                  ],
                  [
                    'start',
                    'Start date and time',
                    'datetime-local',
                    selected
                      ? wallTime(selected.startsAt, selected.timezone)
                      : '',
                    40,
                  ],
                  [
                    'end',
                    'End date and time',
                    'datetime-local',
                    selected
                      ? wallTime(selected.endsAt, selected.timezone)
                      : '',
                    40,
                  ],
                  [
                    'timezone',
                    'Timezone (IANA)',
                    'text',
                    selected?.timezone ?? wedding.timezone,
                    80,
                  ],
                  [
                    'venue',
                    'Venue name',
                    'text',
                    selected?.venue.name ?? wedding.location,
                    160,
                  ],
                ].map(([key, label, type, value, max]) => (
                  <div className={form.field} key={String(key)}>
                    <label htmlFor={'fn-' + key}>{label}</label>
                    <input
                      id={'fn-' + key}
                      name={String(key)}
                      type={String(type)}
                      defaultValue={String(value)}
                      maxLength={Number(max)}
                      required
                    />
                  </div>
                ))}
                <div className={form.field}>
                  <label htmlFor="fn-description">
                    Description / notes (optional)
                  </label>
                  <textarea
                    id="fn-description"
                    name="description"
                    maxLength={300}
                    defaultValue={selected?.description ?? ''}
                  />
                </div>
                <div className={form.field}>
                  <label htmlFor="fn-address">Venue address (optional)</label>
                  <textarea
                    id="fn-address"
                    name="address"
                    maxLength={500}
                    defaultValue={selected?.venue.address ?? ''}
                  />
                </div>
                <p>
                  Use explicit start and end dates for overnight functions.
                  Times follow the selected timezone.
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={form.textButton}
                    onClick={discard}
                  >
                    Cancel
                  </button>
                  <button className={form.primaryButton} type="submit">
                    {pending ? 'Saving…' : 'Save function'}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <>
              <p>{selected && date(selected)}</p>
              <p>
                Ends:{' '}
                {selected &&
                  new Intl.DateTimeFormat('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: selected.timezone,
                  }).format(new Date(selected.endsAt))}
              </p>
              <p>{selected?.description}</p>
              <h3>Venue & directions</h3>
              <p>{selected?.venue.name}</p>
              <p>{selected?.venue.address}</p>
              <h3>Related tasks</h3>
              {taskError ? (
                <p role="alert">{taskError}</p>
              ) : linkedTasks.length ? (
                linkedTasks.map((task) => (
                  <p key={task.id}>
                    {task.title} ·{' '}
                    {task.status === 'done'
                      ? 'Completed'
                      : task.status === 'inProgress'
                        ? 'In Progress'
                        : 'To Do'}
                    {task.overdue ? ' · Overdue' : ''}
                  </p>
                ))
              ) : (
                <p>No related tasks loaded.</p>
              )}
              <Link href={'/account/tasks?eventId=' + selected?.id}>
                Manage tasks for this function →
              </Link>
              <p>
                Expense and guest summaries will appear as those features become
                available.
              </p>
              <div className={styles.actions}>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => dialog.current?.close()}
                >
                  Close
                </button>
                <button
                  className={form.primaryButton}
                  disabled={pending}
                  onClick={() => setEditing(true)}
                >
                  Edit function
                </button>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove this function? Linked planning records will block removal.',
                      )
                    )
                      void write(true);
                  }}
                >
                  Remove function
                </button>
              </div>
            </>
          )}
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
