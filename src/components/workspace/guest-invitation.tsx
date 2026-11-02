'use client';
import { useEffect, useRef, useState } from 'react';
import type { GuestDto } from '@/modules/guests/contracts';
import type { InvitationState } from '@/modules/invitations/contracts';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { guestResponseData as data, GuestRequestError } from './guest-request';
import styles from './guests.module.css';
import form from './workspace.module.css';
import {
  reconcileInvitationAttempt,
  invitationActionSnapshot,
  invitationNavigationBlocked,
  type InvitationAction as Action,
  type InvitationAttempt as Attempt,
} from './invitation-attempt';
export function GuestInvitation({
  guest,
  weddingId,
  userId,
  onPendingChange,
}: {
  guest: GuestDto;
  weddingId: string;
  userId: string;
  onPendingChange: (pending: boolean) => void;
}) {
  const [state, setState] = useState<InvitationState | null>(null),
    [pending, setPending] = useState(false),
    [unresolved, setUnresolved] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirm, setConfirm] = useState<Action | null>(null),
    [privateLink, setPrivateLink] = useState('');
  const attempt = useRef<CreateAttempt<Attempt> | null>(null),
    uncertain = useRef(false),
    busy = useRef(false);
  const endpoint = '/api/v1/guest-contacts/' + guest.id + '/invitation';
  function working(value: boolean) {
    setPending(value);
    setUnresolved(attempt.current !== null);
    onPendingChange(invitationNavigationBlocked(value, attempt.current));
  }
  function verify(value: InvitationState) {
    if (value.weddingId !== weddingId || value.guestId !== guest.id)
      throw new Error('Your guest or wedding changed. Reopen their details.');
    return value;
  }
  useEffect(() => {
    let cancelled = false;
    data(fetch(endpoint, { cache: 'no-store' }))
      .then((value) => {
        if (value.weddingId !== weddingId || value.guestId !== guest.id)
          throw new Error('Your wedding changed. Reopen this guest.');
        if (!cancelled) setState(value);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Could not load invitation details. Try Refresh invitation.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, weddingId, guest.id]);
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setError('');
    working(true);
    try {
      const latest = verify(await data(fetch(endpoint, { cache: 'no-store' })));
      const previous = attempt.current;
      attempt.current = reconcileInvitationAttempt(previous, latest.link);
      if (previous && !attempt.current) {
        uncertain.current = false;
        setNotice(
          'The invitation changed. The old request is no longer retried. Review the current invitation before another action. An email already sent cannot be recalled.',
        );
      }
      setConfirm(null);
      setState(latest);
      setPrivateLink('');
    } catch {
      setError(
        'Could not refresh this invitation. Check your connection and try again.',
      );
    } finally {
      busy.current = false;
      working(false);
    }
  }
  async function authorization() {
    const session = await data(
      fetch('/api/v1/auth/session', { cache: 'no-store' }),
    );
    if (session.user?.id !== userId || session.user?.weddingId !== weddingId)
      throw new Error(
        'Your account or wedding changed. Reload before continuing.',
      );
    return {
      'X-CSRF-Token': session.csrfToken,
      'X-Wedding-Context': weddingId,
    };
  }
  async function act(action: Action) {
    if (busy.current || !state) return;
    let snapshot: Attempt;
    try {
      snapshot = invitationActionSnapshot(
        action,
        attempt.current,
        guest.version,
        state.link?.version,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Resolve the previous request first.',
      );
      return;
    }
    const wasUncertain = uncertain.current;
    if (action !== 'revoke')
      attempt.current = prepareCreate(attempt.current, snapshot);
    busy.current = true;
    working(true);
    setError('');
    setNotice('');
    setPrivateLink('');
    let dispatched = false;
    try {
      const auth = await authorization();
      dispatched = true;
      const result = await data(
        fetch(endpoint + (action === 'issue' ? '' : '/' + action), {
          method: 'POST',
          headers: {
            ...auth,
            ...(snapshot.version !== undefined
              ? { 'If-Match': `"${snapshot.version}"` }
              : {}),
            ...(action !== 'revoke' && attempt.current
              ? { 'Idempotency-Key': attempt.current.key }
              : {}),
            ...(action === 'issue' || action === 'rotate'
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          body:
            action === 'issue' || action === 'rotate'
              ? JSON.stringify({ guestVersion: snapshot.guestVersion })
              : undefined,
        }),
        'save',
      );
      setState(verify(result));
      attempt.current = null;
      uncertain.current = false;
      setConfirm(null);
      setNotice(
        action === 'send' || action === 'remind'
          ? 'Email requested. Refresh to check provider acceptance; inbox delivery is not confirmed.'
          : action === 'revoke'
            ? 'Private invitation access revoked. Old links and guest sessions no longer authorize access.'
            : action === 'rotate'
              ? 'Invitation reissued. Old links and guest sessions no longer work. Existing responses were preserved.'
              : 'Invitation issued. Copy the link or request its email when you’re ready.',
      );
    } catch (e) {
      const rejected =
        e instanceof GuestRequestError &&
        e.status < 500 &&
        !['IDEMPOTENCY_CONFLICT', 'INVITATION_CHANGED'].includes(e.code);
      if (action !== 'revoke') {
        if (!wasUncertain && (!dispatched || rejected)) attempt.current = null;
        else uncertain.current = dispatched || wasUncertain;
      }
      setError(
        e instanceof Error
          ? e.message
          : 'Could not complete the invitation action. Retry the same action.',
      );
    } finally {
      busy.current = false;
      working(false);
    }
  }
  async function copy() {
    if (busy.current) return;
    busy.current = true;
    working(true);
    setError('');
    try {
      const result = await data(
        fetch(endpoint + '/share', {
          method: 'POST',
          headers: await authorization(),
        }),
      );
      if (result.weddingId !== weddingId)
        throw new Error('Your wedding changed. Reload before sharing.');
      setPrivateLink(result.link);
      try {
        await navigator.clipboard.writeText(result.link);
        setNotice(
          'Private link copied. Share it only with this guest; possession grants access.',
        );
      } catch {
        setNotice(
          'Select and copy the private link below. Share it only with this guest.',
        );
      }
    } catch {
      setError(
        'Could not retrieve this private link. Refresh the invitation and try again.',
      );
    } finally {
      busy.current = false;
      working(false);
    }
  }
  const mailLabels: Record<string, string> = {
    'not-requested': 'Email not requested',
    pending: 'Email queued',
    leased: 'Email processing',
    retry: 'Email awaiting retry',
    submitted: 'Accepted by email provider',
    failed: 'Email failed',
    cancelled: 'Email cancelled',
    quarantined: 'Email needs review',
  };
  const delivery =
    mailLabels[state?.delivery ?? 'not-requested'] ??
    'Email status unavailable';
  return (
    <section
      className={styles.invitation}
      aria-label="Private invitation"
      aria-busy={pending}
    >
      <h3>Private invitation & RSVPs</h3>
      <p>
        One personal link, separate responses for each explicitly invited
        function. Guests need no account.
      </p>
      {error && (
        <p role="alert" className={form.formError}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!pending && unresolved && (
        <p role="status">
          A request is unresolved. Retry the same action or refresh to review
          changes. Contact editing and closing are paused to preserve its retry
          key. You can still separately confirm revocation.
        </p>
      )}
      {state && (
        <>
          <p className={styles.badge}>
            {!state.link
              ? 'Not issued'
              : state.link.active
                ? 'Private link active'
                : 'Private link inactive'}
          </p>
          <p>{delivery}</p>
          <p>
            Last reminder:{' '}
            {mailLabels[state.reminderDelivery ?? 'not-requested'] ??
              'Email status unavailable'}
          </p>
          {state.link && (
            <p className={styles.help}>
              Link expires{' '}
              {new Date(state.link.expiresAt).toLocaleDateString('en-IN', {
                timeZone: 'UTC',
                dateStyle: 'medium',
              })}
              . Revocation is available at any time.
            </p>
          )}
          {state.invitations.map((event) => (
            <article key={event.id} className={styles.invitationRow}>
              <strong>{event.title}</strong>
              <span>
                {event.status === 'pending'
                  ? 'Awaiting RSVP'
                  : event.status === 'attending'
                    ? `${event.headcount} attending · ${event.additionalGuests} additional`
                    : 'Declined'}
              </span>
              {event.closed && <small>RSVP closed</small>}
            </article>
          ))}
          {confirm && (
            <div className={styles.confirmation}>
              <h4>
                {confirm === 'revoke'
                  ? 'Revoke this guest’s private access?'
                  : confirm === 'send' || confirm === 'remind'
                    ? `Email ${guest.displayName}?`
                    : confirm === 'rotate'
                      ? 'Reissue and invalidate the old link?'
                      : 'Issue this personal invitation?'}
              </h4>
              <p>
                {confirm === 'send' || confirm === 'remind'
                  ? `An email will be requested for ${guest.email}. Reminders include only unanswered functions that have not started. Shared email addresses do not merge guest access.`
                  : confirm === 'revoke'
                    ? 'All functions on this personal link will stop accepting private access. Historical responses are retained. An email already in flight cannot be recalled.'
                    : 'Only the reviewed selected functions below will be invited. Existing responses are preserved. Issuing a link does not send an email.'}
              </p>
              {confirm === 'remind' && (
                <ul>
                  {state.invitations
                    .filter((e) => e.status === 'pending' && !e.closed)
                    .map((e) => (
                      <li key={e.id}>{e.title}</li>
                    ))}
                </ul>
              )}
              {(confirm === 'issue' || confirm === 'rotate') && (
                <ul>
                  {guest.selectedEvents.map((event) => (
                    <li key={event.id}>{event.title}</li>
                  ))}
                </ul>
              )}
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={form.primaryButton}
                  disabled={pending}
                  onClick={() => void act(confirm)}
                >
                  {pending ? 'Working…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
          {!confirm && (
            <div className={styles.toolbar}>
              {!state.link && (
                <button
                  type="button"
                  className={form.primaryButton}
                  disabled={pending || !guest.selectedEvents.length}
                  onClick={() => setConfirm('issue')}
                >
                  Review & issue invitation
                </button>
              )}
              {state.link?.active && (
                <>
                  <button
                    type="button"
                    className={form.primaryButton}
                    disabled={pending}
                    onClick={() => setConfirm('send')}
                  >
                    {state.delivery === 'not-requested'
                      ? 'Send invitation email'
                      : 'Resend invitation email'}
                  </button>
                  <button
                    type="button"
                    className={form.textButton}
                    disabled={pending}
                    onClick={() => void copy()}
                  >
                    Copy private link
                  </button>
                  <button
                    type="button"
                    className={form.textButton}
                    disabled={pending}
                    onClick={() => setConfirm('revoke')}
                  >
                    Revoke private access
                  </button>
                </>
              )}
              {state.link?.active &&
                state.invitations.some(
                  (e) => e.status === 'pending' && !e.closed,
                ) && (
                  <button
                    type="button"
                    className={form.textButton}
                    disabled={pending}
                    onClick={() => setConfirm('remind')}
                  >
                    Review RSVP reminder
                  </button>
                )}
              {state.link && (
                <button
                  type="button"
                  className={form.textButton}
                  disabled={pending || !guest.selectedEvents.length}
                  onClick={() => setConfirm('rotate')}
                >
                  Review & reissue link
                </button>
              )}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        className={form.textButton}
        disabled={pending}
        onClick={() => void refresh()}
      >
        Refresh invitation
      </button>
      {privateLink && (
        <p>
          <a
            href={
              'https://wa.me/?text=' +
              encodeURIComponent(
                'Your personal wedding invitation: ' + privateLink,
              )
            }
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Share privately on WhatsApp
          </a>{' '}
          — opens WhatsApp; choose this guest and send manually. Anyone
          receiving the link can access their invitation.
        </p>
      )}
      {privateLink && (
        <label className={styles.privateLink}>
          Personal invitation link
          <textarea
            readOnly
            value={privateLink}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}
