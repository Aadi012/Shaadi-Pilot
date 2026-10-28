'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/marketing/brand';
import { LogoutButton } from '@/components/auth/logout-button';
import type { JoinView } from '@/modules/memberships/contracts';
import { inviteContextSchema } from '@/modules/memberships/contracts';
import styles from './team.module.css';
import workspace from './workspace.module.css';
const subscribe = () => () => {};
async function mutate(
  path: string,
  method: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const bootstrap = await fetch('/api/v1/auth/session', { cache: 'no-store' });
  if (!bootstrap.ok) throw new Error();
  const { data } = await bootstrap.json();
  return fetch('/api/v1/member-invites/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': data.csrfToken,
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
export function Join() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const router = useRouter();
  const [view, setView] = useState<JoinView | null>(null);
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const token = useRef<string | null>(null);
  const provided = useRef(false);
  const busy = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      if (token.current === null) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        provided.current = params.has('token');
        token.current = params.has('token') ? (params.get('token') ?? '') : '';
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname,
        );
      }
      try {
        let response: Response;
        if (provided.current) {
          if (
            !inviteContextSchema.safeParse({ token: token.current }).success
          ) {
            await mutate('context', 'DELETE');
            if (active) setView({ state: 'invalid' });
            return;
          }
          response = await mutate('context', 'POST', { token: token.current });
        } else
          response = await fetch('/api/v1/member-invites/context', {
            cache: 'no-store',
          });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (active) setView(body.data);
      } catch {
        if (active)
          setFailure('Could not open your invitation. Please try again.');
      }
    }
    void load();
    function freshLink() {
      if (new URLSearchParams(window.location.hash.slice(1)).has('token'))
        window.location.reload();
    }
    window.addEventListener('hashchange', freshLink);
    return () => {
      active = false;
      window.removeEventListener('hashchange', freshLink);
    };
  }, []);
  useEffect(() => {
    if (view || success) result.current?.focus();
  }, [view, success]);
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      const response =
        !view && token.current
          ? await mutate('context', 'POST', { token: token.current })
          : await fetch('/api/v1/member-invites/context', {
              cache: 'no-store',
            });
      if (!response.ok) throw new Error();
      setView((await response.json()).data);
    } catch {
      setFailure(
        'Could not refresh this invitation. Reopen your email link or try again.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function accept() {
    if (!view?.invitation || !view.user || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      const response = await mutate(
        'accept',
        'POST',
        { invitationId: view.invitation.id },
        { 'X-Organizer-Context': view.user.id },
      );
      if (!response.ok) {
        const body = await response.json();
        setFailure(
          response.status === 429
            ? 'Too many attempts. Try again in 15 minutes.'
            : body.error?.code === 'INVITATION_CONTEXT_CHANGED'
              ? 'Your account or invitation changed. Refresh and review it again.'
              : 'Could not accept this invitation. Refresh to check your account and its current status.',
        );
        return;
      }
      setSuccess(true);
    } catch {
      setFailure(
        'Could not confirm acceptance. Retry or open your wedding overview to check your membership.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function leave() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      const response = await mutate('context', 'DELETE');
      if (!response.ok) throw new Error();
      router.replace('/account');
      router.refresh();
    } catch {
      setFailure('Could not continue. Please try again.');
      busy.current = false;
      setPending(false);
    }
  }
  const state = view?.state;
  const heading = success
    ? 'You’re part of the planning team.'
    : state === 'eligible'
      ? `Join ${view?.invitation?.couple}’s wedding`
      : state === 'signed-out'
        ? 'You’re invited to plan together'
        : state === 'wrong-email'
          ? 'Use the invited email'
          : state === 'other-wedding'
            ? 'One wedding at a time'
            : state === 'already-member'
              ? 'You’re already part of this wedding'
              : state === 'invalid'
                ? 'This invitation is unavailable'
                : 'Review your invitation';
  return (
    <div className={styles.joinPage}>
      <header>
        <Brand href="/" />
      </header>
      <main>
        <section className={styles.joinPanel} aria-labelledby="join-title">
          <p className={workspace.eyebrow}>Wedding workspace invitation</p>
          <h1 id="join-title">{heading}</h1>
          <div ref={result} tabIndex={-1}>
            {failure && (
              <p role="alert" className={workspace.errorNotice}>
                {failure}
              </p>
            )}
            {success ? (
              <>
                <p>
                  Your Manager membership is confirmed. You can now help plan
                  the celebration.
                </p>
                <button
                  className={workspace.primaryButton}
                  disabled={pending}
                  onClick={leave}
                >
                  Open wedding overview
                </button>
              </>
            ) : state === 'signed-out' ? (
              <>
                <p>
                  Log in or create an organizer account with the email that
                  received this invitation. You’ll return here to review it
                  before joining.
                </p>
                <Link href="/login" className={styles.primaryLink}>
                  Log in
                </Link>
                <Link href="/signup">Create an account</Link>
                <p>
                  Your invitation stays here for 15 minutes while you sign in.
                  Reopen the email link if it expires.
                </p>
              </>
            ) : state === 'eligible' ? (
              <>
                <div className={styles.invitationDetails}>
                  <strong>Manager · Shared planning access</strong>
                  <p>
                    Can manage wedding planning. Only Admins manage organizer
                    membership.
                  </p>
                  <p>Signed in as {view?.user?.email}</p>
                </div>
                <p>
                  Accepting joins this wedding. No membership is created until
                  you confirm.
                </p>
                <div className={styles.actions}>
                  <button
                    className={workspace.textButton}
                    disabled={pending}
                    onClick={leave}
                  >
                    Not now
                  </button>
                  <button
                    className={workspace.primaryButton}
                    disabled={!hydrated || pending}
                    onClick={accept}
                  >
                    {pending ? 'Accepting…' : 'Accept invitation'}
                  </button>
                </div>
              </>
            ) : state === 'wrong-email' ? (
              <>
                <p>
                  You’re signed in as {view?.user?.email}. Sign out, then log in
                  with the email that received this invitation. The invitation
                  cannot change your password or account email.
                </p>
                <LogoutButton className={workspace.primaryButton} />
              </>
            ) : state === 'other-wedding' ? (
              <>
                <p>
                  Your account already belongs to a different wedding.
                  ShaadiPilot supports one wedding per organizer; this
                  invitation cannot transfer your membership.
                </p>
                <button
                  className={workspace.primaryButton}
                  disabled={pending}
                  onClick={leave}
                >
                  Open current wedding
                </button>
              </>
            ) : state === 'already-member' ? (
              <>
                <p>No additional membership is needed.</p>
                <button
                  className={workspace.primaryButton}
                  disabled={pending}
                  onClick={leave}
                >
                  Open wedding overview
                </button>
              </>
            ) : state === 'invalid' ? (
              <>
                <p>
                  This invitation is invalid, expired or revoked. Ask the
                  inviting Admin for a new invitation, or reopen your email link
                  if this page’s temporary context expired.
                </p>
                <button
                  className={workspace.textButton}
                  disabled={pending}
                  onClick={leave}
                >
                  Go to your account
                </button>
              </>
            ) : (
              <p role="status">
                {failure
                  ? 'Your invitation has not been accepted.'
                  : 'Loading invitation…'}
              </p>
            )}
            {!success && (
              <button
                className={workspace.textButton}
                disabled={!hydrated || pending}
                onClick={refresh}
              >
                {pending ? 'Please wait…' : 'Refresh invitation'}
              </button>
            )}
          </div>
          <noscript>
            Enable JavaScript to review your invitation securely.
          </noscript>
        </section>
      </main>
      <footer>ShaadiPilot · Your celebration, together</footer>
    </div>
  );
}
