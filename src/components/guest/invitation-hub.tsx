'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  GuestHubDto,
  InvitationEvent,
} from '@/modules/invitations/contracts';
import { rsvpInput, partySize } from '@/modules/invitations/contracts';
import { Brand } from '@/components/marketing/brand';
import styles from './invitation-hub.module.css';
type Hub = GuestHubDto & { csrfToken: string };
async function read(request: Promise<Response>) {
  let response;
  try {
    response = await request;
  } catch {
    throw new Error(
      'We couldn’t connect. Your response draft is kept. Check your internet connection and try again.',
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      'We couldn’t read the response. Retry the same details to check whether they were saved.',
    );
  }
  if (!response.ok)
    throw new Error(
      body.error?.message ??
        'This invitation is unavailable. Ask your organizer for a new private link.',
    );
  return body.data;
}
function current(): Promise<Hub> {
  return read(
    fetch('/api/v1/guest/invitations/current', { cache: 'no-store' }),
  );
}
function FunctionRsvp({
  initial,
  context,
}: {
  initial: InvitationEvent;
  context: string;
}) {
  const [event, setEvent] = useState(initial),
    [status, setStatus] = useState(
      initial.status === 'declined' ? 'declined' : 'attending',
    ),
    [additional, setAdditional] = useState(String(initial.additionalGuests)),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [review, setReview] = useState(false);
  const busy = useRef(false);
  const validCount =
    /^\d+$/.test(additional) && Number.isSafeInteger(Number(additional));
  const total = validCount ? partySize(status, Number(additional)) : '—';
  async function save() {
    if (busy.current) return;
    setError('');
    setNotice('');
    const parsed = rsvpInput.safeParse({
      invitationId: event.id,
      status,
      additionalGuests: /^\d+$/.test(additional) ? Number(additional) : NaN,
    });
    if (!parsed.success) {
      setError(
        'Enter a whole number of additional guests, zero or more. Declining requires zero.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const session = await current();
      if (session.context !== context)
        throw new Error(
          'Another invitation was opened in this browser. Reopen your original private link before saving this response.',
        );
      const result = await read(
        fetch('/api/v1/guest/invitations/current/rsvp', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrfToken,
            'X-Guest-Context': context,
            'If-Match': `"${event.version}"`,
          },
          body: JSON.stringify(parsed.data),
        }),
      );
      setEvent(result.invitation);
      setNotice('Your RSVP is saved. Thank you for letting us know.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your response. Your draft is kept.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function reload() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const hub = await current();
      if (hub.context !== context)
        throw new Error(
          'Another invitation is open. Reopen your original link.',
        );
      const latest = hub.invitations.find((e) => e.id === event.id);
      if (!latest)
        throw new Error(
          'This function is no longer available on your invitation. Contact your organizer.',
        );
      setEvent(latest);
      setStatus(latest.status === 'declined' ? 'declined' : 'attending');
      setAdditional(String(latest.additionalGuests));
      setError('');
      setNotice('Latest response loaded. Review before saving.');
      setReview(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not reload your response.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: event.timezone,
    }).format(new Date(value));
  return (
    <article className={styles.function}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>You’re invited</p>
          <h2>{event.title}</h2>
        </div>
        <span className={styles.badge}>
          {event.status === 'pending'
            ? 'Awaiting response'
            : event.status === 'attending'
              ? `${event.headcount} attending`
              : 'Declined'}
        </span>
      </div>
      {event.description && (
        <p className={styles.description}>{event.description}</p>
      )}
      <dl className={styles.logistics}>
        <div>
          <dt>When</dt>
          <dd>
            {date(event.startsAt)} – {date(event.endsAt)}
            <small>{event.timezone}</small>
          </dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {event.venue.name}
            <small>{event.venue.address}</small>
          </dd>
        </div>
      </dl>
      {event.closed ? (
        <p className={styles.note}>
          RSVP changes closed when this function started. Contact your organizer
          for assistance.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={pending}>
            <legend>Your response for this function</legend>
            <div className={styles.choices}>
              <label>
                <input
                  type="radio"
                  name={'status-' + event.id}
                  checked={status === 'attending'}
                  onChange={() => setStatus('attending')}
                />
                Joyfully attending
              </label>
              <label>
                <input
                  type="radio"
                  name={'status-' + event.id}
                  checked={status === 'declined'}
                  onChange={() => {
                    setStatus('declined');
                    setAdditional('0');
                  }}
                />
                Unable to attend
              </label>
            </div>
            <label className={styles.count}>
              Additional guests, excluding you
              <input
                inputMode="numeric"
                type="text"
                pattern="[0-9]+"
                required
                value={additional}
                disabled={status === 'declined'}
                onChange={(e) => setAdditional(e.currentTarget.value)}
                aria-describedby={'count-help-' + event.id}
              />
            </label>
            <p id={'count-help-' + event.id} className={styles.help}>
              Enter a whole number. There is no allocated plus-one limit or
              approval step.
            </p>
            <p className={styles.tally}>
              Your party size <strong>{total}</strong>
              <span>
                {status === 'attending'
                  ? 'You + your additional guests'
                  : 'No attendees for this function'}
              </span>
            </p>
            <button className={styles.primary} type="submit">
              {pending
                ? 'Saving…'
                : event.status === 'pending'
                  ? 'Send RSVP'
                  : 'Save response'}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.note}>
          {notice}
        </p>
      )}
      {review ? (
        <div className={styles.note}>
          <p>
            Discard this function’s draft and load the latest saved response?
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => setReview(false)}
          >
            Keep draft
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void reload()}
          >
            Discard & load latest
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.textButton}
          disabled={pending}
          onClick={() => setReview(true)}
        >
          Review latest saved response
        </button>
      )}
    </article>
  );
}
export function InvitationHub() {
  const [hub, setHub] = useState<Hub | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [ended, setEnded] = useState(false);
  const bootstrap = useRef<Promise<Hub> | null>(null),
    fragment = useRef<{
      publicId: string | null;
      secret: string | null;
    } | null>(null);
  async function open() {
    if (fragment.current?.secret || fragment.current?.publicId) {
      const session = await read(
        fetch('/api/v1/auth/session', { cache: 'no-store' }),
      );
      await read(
        fetch('/api/v1/guest/invitations/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrfToken,
          },
          body: JSON.stringify(fragment.current),
        }),
      );
      fragment.current = null;
    }
    return current();
  }
  useEffect(() => {
    let cancelled = false;
    if (!bootstrap.current) {
      const values = new URLSearchParams(window.location.hash.slice(1));
      fragment.current = {
        publicId: values.get('publicId'),
        secret: values.get('secret'),
      };
      if (window.location.hash)
        window.history.replaceState(null, '', window.location.pathname);
      bootstrap.current = open();
    }
    const reopen = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener('hashchange', reopen);
    bootstrap.current
      .then((value) => {
        if (!cancelled) {
          setHub(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Your invitation could not be opened.',
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', reopen);
    };
    // One bootstrap promise survives React's development effect replay.
  }, []);
  async function retry() {
    setLoading(true);
    setError('');
    try {
      setHub(await open());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not open your invitation.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    setLoading(true);
    try {
      const session = await current();
      if (session.context !== hub?.context)
        throw new Error(
          'A different invitation is now open. Reload to review it.',
        );
      await read(
        fetch('/api/v1/guest/invitations/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': session.csrfToken },
        }),
      );
      setHub(null);
      setEnded(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not close this invitation.',
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand href="/" />
        <span>Personal invitation</span>
        {hub && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void logout()}
          >
            Close private session
          </button>
        )}
      </header>
      <main className={styles.main}>
        {loading && !hub && (
          <p role="status">Opening your private invitation…</p>
        )}
        {error && (
          <div role="alert" className={styles.error}>
            <h1>Let’s check your invitation</h1>
            <p>{error}</p>
            <button disabled={loading} onClick={() => void retry()}>
              Try again
            </button>
            <p>
              Reopen the original email link if your session has expired. No
              account is needed.
            </p>
          </div>
        )}
        {ended && (
          <section className={styles.welcome}>
            <h1>Your private session is closed.</h1>
            <p>
              Reopen your personal invitation link whenever you need to return.
            </p>
          </section>
        )}
        {hub && (
          <>
            <section className={styles.welcome}>
              <p className={styles.eyebrow}>With love, you’re invited</p>
              <h1>{hub.couple}</h1>
              <div className={styles.divider} aria-hidden="true">
                ✦
              </div>
              <h2>Namaste, {hub.guestName}</h2>
              <p>
                We’d love to celebrate with you. Please respond separately for
                each of your invited functions below.
              </p>
              <p className={styles.help}>
                Keep this personal link private. Anyone holding it can view and
                change these responses.
              </p>
            </section>
            <section
              aria-label="Your invited functions"
              className={styles.schedule}
            >
              {hub.invitations.map((event) => (
                <FunctionRsvp
                  key={hub.context + ':' + event.id}
                  initial={event}
                  context={hub.context}
                />
              ))}
              {!hub.invitations.length && (
                <p>
                  No active functions are available on this invitation. Contact
                  your organizer.
                </p>
              )}
            </section>
            <p className={styles.footer}>
              Your invitation remains available until{' '}
              {new Date(hub.expiresAt).toLocaleDateString('en-IN', {
                timeZone: 'UTC',
                dateStyle: 'medium',
              })}
              . RSVP changes close when each function starts.
            </p>
          </>
        )}
      </main>
      <footer className={styles.footer}>
        Made for your celebration · ShaadiPilot
      </footer>
    </div>
  );
}
