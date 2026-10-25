'use client';
import Link from 'next/link';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createWeddingSchema, slugSchema } from '@/modules/weddings/contracts';
import { MarketingIcon } from '@/components/marketing/icon';
import styles from './workspace.module.css';
const initial = {
  partnerOne: '',
  partnerTwo: '',
  weddingDate: '',
  location: '',
  timezone: 'Asia/Kolkata',
  slug: '',
  intro: '',
};
type Field = keyof typeof initial;
const subscribe = () => () => {};
export function WeddingForm() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const [availability, setAvailability] = useState('');
  const availabilityRequest = useRef<AbortController | null>(null);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  function change(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure('');
    if (field === 'slug') {
      availabilityRequest.current?.abort();
      setAvailability('');
    }
  }
  async function checkSlug() {
    if (!slugSchema.safeParse(values.slug).success) {
      setErrors((current) => ({
        ...current,
        slug: 'Use 3–60 lowercase letters, numbers and single hyphens.',
      }));
      return;
    }
    availabilityRequest.current?.abort();
    const controller = new AbortController();
    availabilityRequest.current = controller;
    setAvailability('Checking…');
    try {
      const response = await fetch(
        '/api/v1/weddings/slug-availability?slug=' +
          encodeURIComponent(values.slug),
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (!controller.signal.aborted)
        setAvailability(
          body.data.available
            ? 'Available right now. Confirmed when you create your wedding.'
            : 'This address is taken. Try another.',
        );
    } catch {
      if (!controller.signal.aborted)
        setAvailability(
          'Could not check right now. You can try creating your wedding.',
        );
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFailure('');
    const parsed = createWeddingSchema.safeParse({
      displayNames: {
        partnerOne: values.partnerOne,
        partnerTwo: values.partnerTwo,
        intro: values.intro,
      },
      weddingDate: values.weddingDate,
      location: values.location,
      timezone: values.timezone,
      slug: values.slug,
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = (
          issue.path[0] === 'displayNames' ? issue.path[1] : issue.path[0]
        ) as Field;
        const messages: Record<Field, string> = {
          partnerOne: 'Enter a name (up to 100 characters).',
          partnerTwo: 'Enter a name (up to 100 characters).',
          intro: 'Keep your introduction within 200 characters.',
          weddingDate: 'Choose a valid wedding date.',
          location: 'Enter a location (up to 160 characters).',
          timezone: 'Select a valid planning timezone.',
          slug: 'Use 3–60 lowercase letters, numbers and single hyphens.',
        };
        next[field] = messages[field];
      }
      setErrors(next);
      const first = Object.keys(next)[0];
      const control = form.current?.elements.namedItem(first);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    setErrors({});
    const body = JSON.stringify(parsed.data);
    if (submission.current?.body !== body)
      submission.current = { body, key: crypto.randomUUID() };
    setPending(true);
    try {
      const response = await fetch('/api/v1/auth/session', {
        cache: 'no-store',
      });
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) throw new Error();
      const session = await response.json();
      if (!session.data.user) {
        router.replace('/login');
        return;
      }
      const created = await fetch('/api/v1/weddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.data.csrfToken,
          'Idempotency-Key': submission.current.key,
        },
        body,
      });
      if (!created.ok) {
        const error = await created.json();
        if (error.error?.code === 'SLUG_TAKEN') {
          setErrors({ slug: 'This wedding address is taken. Choose another.' });
          setAvailability('');
        } else if (error.error?.code === 'USER_ALREADY_IN_WEDDING') {
          router.replace('/account');
          router.refresh();
        } else if (created.status === 401) {
          router.replace('/login');
        } else {
          setFailure(
            error.error?.code === 'RATE_LIMITED'
              ? 'Too many attempts. Please try again in 15 minutes.'
              : 'We couldn’t create your wedding. Your details are still here—please try again.',
          );
        }
        return;
      }
      router.replace('/account');
      router.refresh();
    } catch {
      setFailure(
        'We couldn’t confirm creation. Please retry with these details; we’ll safely check the same request.',
      );
    } finally {
      setPending(false);
    }
  }
  function field(name: Field, label: string, type = 'text', hint?: string) {
    return (
      <div className={styles.field}>
        <label htmlFor={name}>
          {label} {name !== 'intro' && <span aria-hidden="true">*</span>}
        </label>
        <input
          id={name}
          name={name}
          type={type}
          value={values[name]}
          onChange={(event) => change(name, event.target.value)}
          required
          autoComplete={name.startsWith('partner') ? 'name' : 'off'}
          aria-invalid={!!errors[name]}
          aria-describedby={
            errors[name] ? name + '-error' : hint ? name + '-hint' : undefined
          }
        />
        {hint && <small id={name + '-hint'}>{hint}</small>}
        {errors[name] && (
          <p id={name + '-error'} className={styles.fieldError}>
            {errors[name]}
          </p>
        )}
      </div>
    );
  }
  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-label="Wedding details"
      aria-busy={pending}
    >
      {failure && (
        <div role="alert" className={styles.errorNotice}>
          {failure}
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className={styles.fieldError}>
          Please check the highlighted details.
        </p>
      )}
      <fieldset disabled={!hydrated || pending} className={styles.formFields}>
        <legend className={styles.srOnly}>Your wedding details</legend>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>
            <span>1</span>
            <div>
              <h2>The couple</h2>
              <p>The names at the heart of your celebration.</p>
            </div>
            <small>Required</small>
          </div>
          <div className={styles.fieldGrid}>
            {field('partnerOne', 'Partner one’s name')}
            {field('partnerTwo', 'Partner two’s name')}
          </div>
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>
            <span>2</span>
            <div>
              <h2>Ceremony & destination</h2>
              <p>A starting point for your wedding celebrations.</p>
            </div>
            <small>Required</small>
          </div>
          <div className={styles.fieldGrid}>
            {field(
              'weddingDate',
              'Main wedding date',
              'date',
              'Your main ceremony date. Functions can have their own dates later.',
            )}
            {field(
              'location',
              'Wedding location / destination',
              'text',
              'Enter a city or venue manually. You can add function venues later.',
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="timezone">Planning timezone *</label>
            <select
              id="timezone"
              name="timezone"
              value={values.timezone}
              onChange={(event) => change('timezone', event.target.value)}
              aria-invalid={!!errors.timezone}
            >
              {[
                'Asia/Kolkata',
                'Asia/Dubai',
                'Europe/London',
                'America/New_York',
                'America/Los_Angeles',
                'Asia/Singapore',
              ].map((zone) => (
                <option key={zone} value={zone}>
                  {zone === 'Asia/Kolkata'
                    ? 'India · Asia/Kolkata'
                    : zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <small>
              Your wedding and function times will be displayed in this
              timezone.
            </small>
            {errors.timezone && (
              <p className={styles.fieldError}>{errors.timezone}</p>
            )}
          </div>
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>
            <span>3</span>
            <div>
              <h2>Personalized address & welcome</h2>
              <p>A little space that feels like you.</p>
            </div>
            <small>Your details</small>
          </div>
          <div className={styles.field}>
            <label htmlFor="slug">Proposed wedding address *</label>
            <div className={styles.slugInput}>
              <span>/w/</span>
              <input
                id="slug"
                name="slug"
                value={values.slug}
                onChange={(event) => change('slug', event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={!!errors.slug}
                aria-describedby="slug-help"
              />
              <button
                type="button"
                onClick={checkSlug}
                className={styles.textButton}
              >
                Check availability
              </button>
            </div>
            <small id="slug-help">
              Lowercase letters, numbers and hyphens. Your website stays
              unpublished.
            </small>
            <p role="status" className={styles.availability}>
              {availability}
            </p>
            {errors.slug && <p className={styles.fieldError}>{errors.slug}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="intro">
              Short introduction <small>(optional)</small>
            </label>
            <textarea
              id="intro"
              name="intro"
              value={values.intro}
              maxLength={200}
              onChange={(event) => change('intro', event.target.value)}
              placeholder="A few words about your celebration…"
              rows={4}
            />
            <small>{values.intro.length} / 200 characters</small>
            {errors.intro && (
              <p className={styles.fieldError}>{errors.intro}</p>
            )}
          </div>
        </section>
        <div className={styles.submitRow}>
          <Link href="/onboarding">← Back to overview</Link>
          <button className={styles.primaryButton} type="submit">
            {pending ? 'Creating your workspace…' : 'Create wedding workspace'}
            <MarketingIcon name="arrow" size={17} />
          </button>
        </div>
      </fieldset>
      <noscript>Enable JavaScript to create your wedding securely.</noscript>
    </form>
  );
}
