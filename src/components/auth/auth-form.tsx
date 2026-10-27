'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from './form-field';
import { REGISTRATION_MESSAGE } from '@/modules/auth/contracts';
import {
  validateAuthForm,
  type AuthMode,
  type AuthFieldName,
  type AuthFormErrors,
  type AuthFormValues,
} from './auth-validation';
import styles from './auth.module.css';

const emptyValues: AuthFormValues = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
};
const fieldOrder: AuthFieldName[] = [
  'fullName',
  'email',
  'password',
  'confirmPassword',
];
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const signup = mode === 'signup';
  // Prevent native GET submission of credentials before JavaScript hydrates.
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [values, setValues] = useState<AuthFormValues>(emptyValues);
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState('');
  const [registered, setRegistered] = useState(false);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const registrationResult = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (registered) registrationResult.current?.focus();
  }, [registered]);

  function change(name: AuthFieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({
      ...current,
      [name]: undefined,
      ...(name === 'password' ? { confirmPassword: undefined } : {}),
    }));
    setFailure('');
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validationErrors = validateAuthForm(mode, values);
    setErrors(validationErrors);
    setFailure('');
    const firstError = fieldOrder.find((name) => validationErrors[name]);
    if (firstError) {
      const input = form.current?.elements.namedItem(firstError);
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    setSubmitting(true);
    try {
      const session = await fetch('/api/v1/auth/session', {
        cache: 'no-store',
      });
      if (!session.ok) throw new Error();
      const bootstrap = await session.json();
      const response = await fetch(
        '/api/v1/auth/' + (signup ? 'register' : 'login'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': bootstrap.data.csrfToken,
          },
          body: JSON.stringify({
            email: values.email,
            password: values.password,
            ...(signup ? { displayName: values.fullName } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          INVALID_CREDENTIALS: 'Email or password is incorrect.',
          RATE_LIMITED: 'Too many attempts. Please try again in 15 minutes.',
          CSRF_FAILED: 'Please refresh the page and try again.',
          VALIDATION_ERROR: 'Please check your name, email and password.',
        };
        setFailure(
          messages[body.error?.code] ??
            'Account access is temporarily unavailable. Please try again.',
        );
        return;
      }
      setValues(emptyValues);
      if (signup) {
        setRegistered(true);
        return;
      }
      router.replace('/account');
      router.refresh();
    } catch {
      setFailure('Could not connect. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-label={signup ? 'Sign up' : 'Log in'}
      aria-busy={submitting}
    >
      {failure && (
        <p role="alert" className={styles.errorSummary}>
          {failure}
        </p>
      )}
      {registered && (
        <div
          ref={registrationResult}
          tabIndex={-1}
          role="status"
          className={styles.registrationResult}
        >
          <p>{REGISTRATION_MESSAGE}</p>
          <Link href="/login">Continue to log in →</Link>
        </div>
      )}
      {Object.values(errors).some(Boolean) && (
        <p role="alert" className={styles.errorSummary}>
          Please check the highlighted fields.
        </p>
      )}
      <fieldset
        disabled={!hydrated || submitting || registered}
        className={styles.fields}
      >
        <legend className={styles.srOnly}>
          {signup ? 'Your organizer details' : 'Your sign-in details'}
        </legend>
        {signup && (
          <FormField
            name="fullName"
            label="Full name"
            autoComplete="name"
            placeholder="e.g. Ananya Sharma"
            value={values.fullName}
            error={errors.fullName}
            onChange={(value) => change('fullName', value)}
          />
        )}
        <FormField
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          error={errors.email}
          onChange={(value) => change('email', value)}
        />
        <FormField
          name="password"
          label={signup ? 'Create password' : 'Password'}
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder={signup ? 'Choose a password' : 'Enter your password'}
          value={values.password}
          error={errors.password}
          hint={
            signup
              ? 'Use 15–128 characters. A memorable passphrase works well.'
              : undefined
          }
          onChange={(value) => change('password', value)}
        />
        {signup && (
          <FormField
            name="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your password again"
            value={values.confirmPassword}
            error={errors.confirmPassword}
            onChange={(value) => change('confirmPassword', value)}
          />
        )}
        {!signup && (
          <div className={styles.recoveryRow}>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
        )}
        {signup && (
          <p className={styles.nextStep}>
            One account for your shared celebration.
            <br />
            <span>Wedding setup follows in a later step.</span>
          </p>
        )}
        <button
          type="submit"
          disabled={!hydrated || submitting || registered}
          className={styles.submitButton}
        >
          {submitting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />{' '}
              {signup ? 'Creating account…' : 'Signing in…'}
            </>
          ) : (
            <>
              {signup ? 'Create account' : 'Log in'}
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </fieldset>
      <p className={styles.switchMode}>
        {signup
          ? 'Already have an organizer account?'
          : 'Planning a new celebration?'}{' '}
        <Link href={signup ? '/login' : '/signup'}>
          {signup ? 'Log in' : 'Create an account'}{' '}
          <span aria-hidden="true">↗</span>
        </Link>
      </p>
      <p className={styles.guestNote}>
        For organizers only. Guests use their private invitation and gallery
        links—no account needed.
      </p>
      <noscript>
        <p className={styles.hint}>Enable JavaScript to use this form.</p>
      </noscript>
    </form>
  );
}
