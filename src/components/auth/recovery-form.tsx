'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FormField } from './form-field';
import {
  passwordSchema,
  resetRequestSchema,
  resetTokenSchema,
  RESET_REQUEST_MESSAGE,
} from '@/modules/auth/contracts';
import { MarketingIcon } from '@/components/marketing/icon';
import authStyles from './auth.module.css';
import styles from './recovery.module.css';
const subscribe = () => () => {};
type Stage =
  'form' | 'checking' | 'check-error' | 'invalid' | 'sent' | 'success';
async function post(path: string, body: unknown) {
  const session = await fetch('/api/v1/auth/session', { cache: 'no-store' });
  if (!session.ok) throw new Error();
  const bootstrap = await session.json();
  return fetch('/api/v1/auth/password-reset/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': bootstrap.data.csrfToken,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}
export function RecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [stage, setStage] = useState<Stage>(
    mode === 'reset' ? 'checking' : 'form',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const token = useRef<string | null>(null);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (['sent', 'success', 'invalid', 'check-error'].includes(stage))
      result.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (mode !== 'reset') return;
    let active = true;
    async function inspect() {
      if (token.current === null) {
        token.current =
          new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname,
        );
      }
      await Promise.resolve();
      if (!resetTokenSchema.safeParse(token.current).success) {
        if (active) setStage('invalid');
        return;
      }
      try {
        const response = await post('validate', { token: token.current });
        if (active) {
          if (!response.ok) {
            setStage('check-error');
            return;
          }
          const body = await response.json();
          setStage(body.data.valid ? 'form' : 'invalid');
        }
      } catch {
        if (active) setStage('check-error');
      }
    }
    void inspect();
    // Email links can navigate only the fragment of an already-open reset page.
    // A fresh document also clears any password draft tied to the previous link.
    function openNewLink() {
      if (new URLSearchParams(window.location.hash.slice(1)).has('token'))
        window.location.reload();
    }
    window.addEventListener('hashchange', openNewLink);
    return () => {
      active = false;
      window.removeEventListener('hashchange', openNewLink);
    };
  }, [mode]);
  async function retryInspect() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await post('validate', { token: token.current });
      if (!response.ok) throw new Error();
      setStage((await response.json()).data.valid ? 'form' : 'invalid');
    } catch {
      setFailure('Could not check this link. Please try again shortly.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setFailure('');
    const next: Record<string, string> = {};
    if (mode === 'request') {
      if (!resetRequestSchema.safeParse({ email }).success)
        next.email = 'Enter a valid email address.';
    } else {
      if (!passwordSchema.safeParse(password).success)
        next.password = 'Use 15–128 characters. Spaces are welcome.';
      if (password !== confirmation)
        next.confirmPassword = 'Your passwords do not match.';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      const control = form.current?.elements.namedItem(Object.keys(next)[0]);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const response = await post(
        mode === 'request' ? 'requests' : 'confirm',
        mode === 'request' ? { email } : { token: token.current, password },
      );
      if (response.ok) {
        setPassword('');
        setConfirmation('');
        if (mode === 'reset') token.current = '';
        setStage(mode === 'request' ? 'sent' : 'success');
        return;
      }
      const body = await response.json();
      if (body.error?.code === 'INVALID_RESET_LINK') {
        setPassword('');
        setConfirmation('');
        token.current = '';
        setStage('invalid');
        return;
      }
      setFailure(
        response.status === 429
          ? 'Too many attempts. Please try again in 15 minutes.'
          : response.status === 422
            ? 'Please check your details and try again.'
            : 'Password recovery is temporarily unavailable. Please try again.',
      );
    } catch {
      setFailure('Could not connect. Please try again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const heading =
    stage === 'sent'
      ? 'Check your email'
      : stage === 'success'
        ? 'Password updated'
        : stage === 'invalid'
          ? 'This link is no longer valid'
          : stage === 'checking'
            ? 'Checking your reset link'
            : stage === 'check-error'
              ? 'Could not check this link'
              : mode === 'request'
                ? 'Forgot your password?'
                : 'Choose a new password';
  return (
    <section className={styles.panel} aria-labelledby="recovery-heading">
      <div className={styles.emblem}>
        <MarketingIcon
          name={
            stage === 'sent'
              ? 'mail'
              : stage === 'success'
                ? 'heart'
                : 'sparkle'
          }
          size={22}
        />
      </div>
      <p className={styles.eyebrow}>Your celebration, together</p>
      <h1 id="recovery-heading">{heading}</h1>
      {stage === 'form' && (
        <>
          <p className={styles.description}>
            {mode === 'request'
              ? 'Enter your email address to request a password reset link.'
              : 'Create a new password for your ShaadiPilot account.'}
          </p>
          <form
            ref={form}
            onSubmit={submit}
            noValidate
            aria-label={
              mode === 'request' ? 'Request password reset' : 'Reset password'
            }
            aria-busy={pending}
          >
            {failure && (
              <p role="alert" className={authStyles.errorSummary}>
                {failure}
              </p>
            )}
            <fieldset
              disabled={!hydrated || pending}
              className={authStyles.fields}
            >
              <legend className={authStyles.srOnly}>
                {mode === 'request' ? 'Recovery email' : 'New password'}
              </legend>
              {mode === 'request' ? (
                <FormField
                  name="email"
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  maxLength={254}
                  error={errors.email}
                  onChange={(value) => {
                    setEmail(value);
                    setErrors({});
                    setFailure('');
                  }}
                />
              ) : (
                <>
                  <FormField
                    name="password"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Choose a new password"
                    value={password}
                    maxLength={128}
                    hint="Use at least 15 characters. Spaces are welcome."
                    error={errors.password}
                    onChange={(value) => {
                      setPassword(value);
                      setErrors({});
                      setFailure('');
                    }}
                  />
                  <FormField
                    name="confirmPassword"
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Enter your password again"
                    value={confirmation}
                    maxLength={128}
                    error={errors.confirmPassword}
                    onChange={(value) => {
                      setConfirmation(value);
                      setErrors((current) => ({
                        ...current,
                        confirmPassword: '',
                      }));
                      setFailure('');
                    }}
                  />
                </>
              )}
              <button type="submit" className={authStyles.submitButton}>
                {pending
                  ? mode === 'request'
                    ? 'Requesting link…'
                    : 'Resetting password…'
                  : mode === 'request'
                    ? 'Send reset link'
                    : 'Reset password'}
              </button>
            </fieldset>
          </form>
          <Link href="/login" className={styles.back}>
            ← Back to log in
          </Link>
          {mode === 'request' && (
            <p className={styles.note}>
              For security, we don’t disclose whether an email address is
              registered.
            </p>
          )}
        </>
      )}
      {stage === 'checking' && (
        <p className={styles.description} role="status">
          Please wait while we check your link.
        </p>
      )}
      {['sent', 'success', 'invalid', 'check-error'].includes(stage) && (
        <div ref={result} tabIndex={-1} role="status" className={styles.result}>
          {stage === 'sent' ? (
            <>
              <p>{RESET_REQUEST_MESSAGE}</p>
              <p>
                Check your spam folder. The link will expire after 30 minutes.
                If it expires, request a new link.
              </p>
              <Link href="/login" className={styles.primary}>
                Back to log in
              </Link>
              <button
                className={styles.secondary}
                onClick={() => {
                  setStage('form');
                  setFailure('');
                }}
              >
                Try another email
              </button>
            </>
          ) : stage === 'success' ? (
            <>
              <p>
                Your password has been updated. Sign in with your new password.
                Your previous sessions have been signed out.
              </p>
              <Link href="/login" className={styles.primary}>
                Back to log in
              </Link>
            </>
          ) : stage === 'invalid' ? (
            <>
              <p>
                This reset link is invalid or has expired. Request a new one.
              </p>
              <Link href="/forgot-password" className={styles.primary}>
                Request a new link
              </Link>
              <Link href="/login" className={styles.back}>
                Back to log in
              </Link>
            </>
          ) : (
            <>
              <p>Please try checking your link again.</p>
              {failure && <p role="alert">{failure}</p>}
              <button
                className={styles.primary}
                disabled={pending}
                onClick={retryInspect}
              >
                {pending ? 'Checking…' : 'Try again'}
              </button>
              <Link href="/forgot-password" className={styles.back}>
                Request a new link
              </Link>
            </>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to recover your account securely.</noscript>
    </section>
  );
}
