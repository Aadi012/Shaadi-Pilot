'use client';
import { useRef, useState } from 'react';
import type { WeddingDto } from '@/modules/weddings/contracts';
import type { EventDto } from '@/modules/events/contracts';
import {
  expenseInput,
  parseRupees,
  rupees,
  formatInr,
  type ExpenseDto,
  type ExpensePage,
  type ExpenseInput,
} from '@/modules/expenses/contracts';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { guestResponseData, guestCreateAfterFailure } from './guest-request';
import { WorkspaceShell } from './workspace-shell';
import styles from './guests.module.css';
import shared from './team.module.css';
import form from './workspace.module.css';
const blank = {
  title: '',
  amount: '',
  paidAt: '',
  category: '',
  notes: '',
  eventId: '',
};
export function Expenses({
  wedding,
  name,
  role,
  userId,
  initial,
  initialEvents,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
  initial: ExpensePage;
  initialEvents: { events: EventDto[]; nextCursor: string | null };
}) {
  const [page, setPage] = useState(initial),
    [query, setQuery] = useState(''),
    [filters, setFilters] = useState({
      eventId: '',
      category: '',
      from: '',
      to: '',
    }),
    [events, setEvents] = useState(initialEvents.events),
    [eventCursor, setEventCursor] = useState(initialEvents.nextCursor),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<ExpenseDto | null>(null),
    [draft, setDraft] = useState(blank),
    [baseline, setBaseline] = useState(blank),
    [confirm, setConfirm] = useState<'discard' | 'remove' | 'latest' | null>(
      null,
    );
  const dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    sequence = useRef(0),
    attempt = useRef<CreateAttempt<ExpenseInput> | null>(null),
    uncertain = useRef(false);
  function verify(data: { weddingId: string }) {
    if (data.weddingId !== wedding.id)
      throw new Error('Your wedding changed. Reload before continuing.');
  }
  async function load(value = query, append = false) {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams(value);
      if (append && page.nextCursor) params.set('cursor', page.nextCursor);
      const data: ExpensePage = await guestResponseData(
        fetch('/api/v1/expenses?' + params, { cache: 'no-store' }),
      );
      verify(data);
      if (request === sequence.current) {
        setPage((old) => ({
          ...data,
          expenses: append
            ? [...old.expenses, ...data.expenses]
            : data.expenses,
        }));
        setQuery(value);
        setError('');
      }
    } catch {
      if (request === sequence.current)
        setError('Could not load expenses. Check your connection and retry.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }
  function open(row: ExpenseDto | null) {
    attempt.current = null;
    uncertain.current = false;
    const value = row
      ? {
          title: row.title,
          amount: rupees(row.amountMinor),
          paidAt: row.paidAt,
          category: row.category,
          notes: row.notes,
          eventId: row.eventId ?? '',
        }
      : {
          ...blank,
          paidAt: new Intl.DateTimeFormat('en-CA', {
            timeZone: wedding.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date()),
        };
    setDraft(value);
    setBaseline(value);
    setSelected(row);
    setConfirm(null);
    setError('');
    dialog.current?.showModal();
  }
  function close() {
    if (pending) return;
    if (attempt.current || JSON.stringify(draft) !== JSON.stringify(baseline))
      setConfirm('discard');
    else dialog.current?.close();
  }
  async function authorization() {
    const session = await guestResponseData(
      fetch('/api/v1/auth/session', { cache: 'no-store' }),
    );
    if (session.user?.id !== userId || session.user?.weddingId !== wedding.id)
      throw new Error('Your account or wedding changed. Reload before saving.');
    return {
      'X-CSRF-Token': session.csrfToken,
      'X-Wedding-Context': wedding.id,
    };
  }
  async function save(remove = false) {
    if (busy.current) return;
    let body: ExpenseInput | undefined;
    try {
      if (!remove)
        body = expenseInput.parse({
          title: draft.title,
          amountMinor: parseRupees(draft.amount),
          currency: 'INR',
          paidAt: draft.paidAt,
          category: draft.category,
          notes: draft.notes,
          eventId: draft.eventId || null,
        });
      if (!selected) attempt.current = prepareCreate(attempt.current, body!);
    } catch {
      setError(
        'Check the amount, title and payment date. Amounts need at most two decimal places. If a previous save is unresolved, retry its unchanged details first.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    let dispatched = false;
    try {
      const auth = await authorization();
      dispatched = true;
      const result = await guestResponseData(
        fetch('/api/v1/expenses' + (selected ? '/' + selected.id : ''), {
          method: remove ? 'DELETE' : selected ? 'PATCH' : 'POST',
          headers: {
            ...auth,
            ...(selected
              ? { 'If-Match': '"' + selected.version + '"' }
              : { 'Idempotency-Key': attempt.current!.key }),
            ...(!remove ? { 'Content-Type': 'application/json' } : {}),
          },
          body: remove ? undefined : JSON.stringify(body),
        }),
        'save',
      );
      verify(result);
      attempt.current = null;
      uncertain.current = false;
      dialog.current?.close();
      setConfirm(null);
      setNotice(remove ? 'Expense removed.' : 'Expense saved.');
      await load();
    } catch (e) {
      if (!selected) {
        const next = guestCreateAfterFailure(
          attempt.current,
          e,
          uncertain.current,
          dispatched,
        );
        attempt.current = next.attempt;
        uncertain.current = next.uncertain;
      }
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save expense. Your draft is kept.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function latest() {
    if (!selected) return;
    setPending(true);
    try {
      const data = await guestResponseData(
        fetch('/api/v1/expenses/' + selected.id, { cache: 'no-store' }),
      );
      verify(data);
      open(data.expense);
    } catch {
      setError('Could not load the latest expense. Your draft is kept.');
    } finally {
      setPending(false);
    }
  }
  async function moreEvents() {
    if (!eventCursor) return;
    setLoading(true);
    try {
      const data = await guestResponseData(
        fetch('/api/v1/events?cursor=' + encodeURIComponent(eventCursor), {
          cache: 'no-store',
        }),
      );
      verify(data);
      setEvents((old) => [...old, ...data.events]);
      setEventCursor(data.nextCursor);
    } catch {
      setError('Could not load more functions. Retry shortly.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <WorkspaceShell wedding={wedding} name={name} role={role} active="Expenses">
      <div className={shared.container}>
        <div className={shared.heading}>
          <div>
            <p className={form.eyebrow}>Every detail, thoughtfully recorded</p>
            <h1>Wedding expenses</h1>
            <p>Keep a shared record of what you’ve paid.</p>
          </div>
          <button className={form.primaryButton} onClick={() => open(null)}>
            Add expense
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        <section className={styles.summary} aria-label="Recorded spending">
          <article>
            <h2>Recorded spending · current filters</h2>
            <strong
              style={{
                fontSize: 'clamp(20px,3vw,36px)',
                overflowWrap: 'anywhere',
              }}
            >
              {formatInr(page.summary.amountMinor)}
            </strong>
            <p>{page.summary.count} paid entries · INR</p>
          </article>
          <article>
            <h2>Spending by function · current filters</h2>
            {page.summary.byEvent.length ? (
              page.summary.byEvent.map((item) => (
                <p key={item.eventId ?? 'none'}>
                  {item.eventId
                    ? (events.find((e) => e.id === item.eventId)?.title ??
                      'Linked function')
                    : 'No function'}{' '}
                  · {formatInr(item.amountMinor)}
                </p>
              ))
            ) : (
              <p>No expenses recorded.</p>
            )}
          </article>
        </section>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault();
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(filters))
              if (v) params.set(k, v);
            void load(params.toString());
          }}
        >
          <div className={styles.filterGrid}>
            {(['eventId', 'category', 'from', 'to'] as const).map((key) => (
              <label key={key}>
                {
                  {
                    eventId: 'Function',
                    category: 'Category',
                    from: 'Paid from',
                    to: 'Paid through',
                  }[key]
                }
                {key === 'eventId' ? (
                  <select
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters((v) => ({ ...v, [key]: e.target.value }))
                    }
                  >
                    <option value="">All functions</option>
                    <option value="none">No function</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={key === 'category' ? 'text' : 'date'}
                    maxLength={80}
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <div className={styles.toolbar}>
            <button className={form.primaryButton} disabled={loading}>
              Apply filters
            </button>
            <button
              type="button"
              className={form.textButton}
              disabled={loading}
              onClick={() => {
                setFilters({ eventId: '', category: '', from: '', to: '' });
                void load('');
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className={form.textButton}
              disabled={loading}
              onClick={() => void load()}
            >
              Refresh
            </button>
            {eventCursor && (
              <button
                type="button"
                className={form.textButton}
                disabled={loading}
                onClick={() => void moreEvents()}
              >
                Load more functions
              </button>
            )}
          </div>
        </form>
        <section className={styles.registry} aria-label="Expense entries">
          {!page.expenses.length ? (
            <div style={{ padding: 32 }}>
              <h2>Your expense record starts here</h2>
              <p>Add a payment to see it in your wedding spending totals.</p>
            </div>
          ) : (
            page.expenses.map((row) => (
              <article
                key={row.id}
                className={styles.invitationRow}
                style={{ padding: 24 }}
              >
                <strong>
                  {row.title} · {formatInr(row.amountMinor)}
                </strong>
                <p>
                  {row.paidAt} · {row.category || 'Uncategorized'} ·{' '}
                  {row.eventTitle ?? 'No function'}
                </p>
                {row.notes && <p>{row.notes}</p>}
                <button className={form.textButton} onClick={() => open(row)}>
                  View / edit expense
                </button>
              </article>
            ))
          )}
          {page.nextCursor && (
            <button
              className={form.textButton}
              disabled={loading}
              onClick={() => void load(query, true)}
            >
              Load more expenses
            </button>
          )}
        </section>
        <dialog
          ref={dialog}
          className={shared.dialog}
          aria-labelledby="expense-heading"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div style={{ padding: 24 }}>
            <h2 id="expense-heading">
              {selected ? 'Expense details' : 'Add a paid expense'}
            </h2>
            {error && (
              <p role="alert" className={form.formError}>
                {error}
              </p>
            )}
            {confirm ? (
              <div>
                <p>
                  {confirm === 'discard'
                    ? 'Discard this draft? An unresolved save may already have succeeded; refresh before adding it again.'
                    : confirm === 'remove'
                      ? 'Remove this paid entry from your spending totals?'
                      : 'Discard your draft and review the latest saved details?'}
                </p>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  Keep editing
                </button>
                <button
                  className={form.primaryButton}
                  disabled={pending}
                  onClick={() => {
                    if (confirm === 'remove') void save(true);
                    else if (confirm === 'latest') void latest();
                    else {
                      attempt.current = null;
                      dialog.current?.close();
                      setConfirm(null);
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <fieldset disabled={pending} style={{ border: 0, padding: 0 }}>
                  {(
                    [
                      'title',
                      'amount',
                      'paidAt',
                      'category',
                      'eventId',
                      'notes',
                    ] as const
                  ).map((key) => (
                    <div className={form.field} key={key}>
                      <label htmlFor={'expense-' + key}>
                        {
                          {
                            title: 'Description',
                            amount: 'Amount paid (INR)',
                            paidAt: 'Payment date',
                            category: 'Category (optional)',
                            eventId: 'Function (optional)',
                            notes: 'Notes (optional)',
                          }[key]
                        }
                      </label>
                      {key === 'eventId' ? (
                        <select
                          id={'expense-' + key}
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft((v) => ({ ...v, [key]: e.target.value }))
                          }
                        >
                          <option value="">No function</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                      ) : key === 'notes' ? (
                        <textarea
                          id={'expense-' + key}
                          maxLength={2000}
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft((v) => ({ ...v, [key]: e.target.value }))
                          }
                        />
                      ) : (
                        <input
                          id={'expense-' + key}
                          type={key === 'paidAt' ? 'date' : 'text'}
                          inputMode={key === 'amount' ? 'decimal' : undefined}
                          required={['title', 'amount', 'paidAt'].includes(key)}
                          maxLength={
                            key === 'title' ? 160 : key === 'category' ? 80 : 40
                          }
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft((v) => ({ ...v, [key]: e.target.value }))
                          }
                        />
                      )}
                    </div>
                  ))}
                  <p>
                    Record payments already made. Payment dates are calendar
                    dates in your wedding records.
                  </p>
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      className={form.textButton}
                      onClick={close}
                    >
                      Cancel
                    </button>
                    <button className={form.primaryButton}>
                      {pending ? 'Saving…' : 'Save expense'}
                    </button>
                    {selected && (
                      <>
                        <button
                          type="button"
                          className={form.textButton}
                          onClick={() => setConfirm('latest')}
                        >
                          Load latest details
                        </button>
                        <button
                          type="button"
                          className={form.textButton}
                          onClick={() => setConfirm('remove')}
                        >
                          Remove expense
                        </button>
                      </>
                    )}
                  </div>
                </fieldset>
              </form>
            )}
          </div>
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
