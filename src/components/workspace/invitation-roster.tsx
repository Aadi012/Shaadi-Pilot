'use client';
import { useRef, useState } from 'react';
import type { EventDto } from '@/modules/events/contracts';
import { guestResponseData } from './guest-request';
import styles from './guests.module.css';
import form from './workspace.module.css';
type Page = {
  weddingId: string;
  eventId: string;
  title: string;
  rows: {
    id: string;
    guestId: string;
    name: string;
    email: string;
    status: string;
    headcount: string;
    active: boolean;
  }[];
  nextCursor: string | null;
};
export function InvitationRoster({
  weddingId,
  events,
}: {
  weddingId: string;
  events: EventDto[];
}) {
  const [eventId, setEventId] = useState(''),
    [page, setPage] = useState<Page | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0);
  async function load(id: string, append = false) {
    const request = ++sequence.current;
    setPending(true);
    setError('');
    try {
      const cursor = append ? page?.nextCursor : null;
      const result: Page = await guestResponseData(
        fetch(
          '/api/v1/events/' +
            id +
            '/invitations' +
            (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          { cache: 'no-store' },
        ),
      );
      if (result.weddingId !== weddingId || result.eventId !== id)
        throw new Error(
          'Your wedding or function changed. Reload before continuing.',
        );
      if (sequence.current === request)
        setPage((old) => ({
          ...result,
          rows:
            append && old?.eventId === id
              ? [...old.rows, ...result.rows]
              : result.rows,
        }));
    } catch {
      if (sequence.current === request)
        setError(
          'Could not load the invitation roster. Check your connection and retry.',
        );
    } finally {
      if (sequence.current === request) setPending(false);
    }
  }
  return (
    <section className={styles.filters} aria-label="Function invitation roster">
      <h2>Invitations by function</h2>
      <p>
        Review issued invitations and each guest’s response. Planned contacts
        appear after their invitation is explicitly issued.
      </p>
      {!events.length && (
        <p>
          Add a function in <a href="/account/functions">Functions</a> before
          reviewing its invitations.
        </p>
      )}
      <label>
        Function
        <select
          value={eventId}
          disabled={pending}
          onChange={(e) => {
            setEventId(e.target.value);
            setPage(null);
            setError('');
            if (e.target.value) void load(e.target.value);
          }}
        >
          <option value="">Choose a function</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {eventId && (
        <button
          type="button"
          className={form.textButton}
          disabled={pending}
          onClick={() => void load(eventId)}
        >
          Refresh roster
        </button>
      )}
      {pending && <p role="status">Loading invitations…</p>}
      {page && (
        <>
          <h3>{page.title}</h3>
          {!page.rows.length && (
            <p>No issued invitations found for this function.</p>
          )}
          {page.rows.map((row) => (
            <article key={row.id} className={styles.invitationRow}>
              <div>
                <strong>{row.name}</strong>
                <p>{row.email}</p>
              </div>
              <p>
                {row.active
                  ? row.status === 'pending'
                    ? 'Awaiting RSVP'
                    : row.status === 'attending'
                      ? row.headcount + ' attending'
                      : 'Declined'
                  : 'Private access inactive · historical ' + row.status}
              </p>
              <small>
                Open this contact’s Details below to review email, reminder and
                private sharing actions.
              </small>
            </article>
          ))}
          {page.nextCursor && (
            <button
              type="button"
              className={form.textButton}
              disabled={pending}
              onClick={() => void load(page.eventId, true)}
            >
              Load more invitations
            </button>
          )}
        </>
      )}
    </section>
  );
}
