'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  editWeddingSchema,
  type EditWeddingInput,
  type WeddingDto,
} from '@/modules/weddings/contracts';
import { WorkspaceShell } from './workspace-shell';
import {
  saveWeddingDetails,
  WEDDING_CONTEXT_CHANGED_MESSAGE,
} from './wedding-settings-client';
import styles from './workspace.module.css';
const subscribe = () => () => {};
const editable = (wedding: WeddingDto): EditWeddingInput => ({
  displayNames: { ...wedding.displayNames },
  weddingDate: wedding.weddingDate,
  location: wedding.location,
  timezone: wedding.timezone,
});
const zones = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Singapore',
];
export function WeddingSettings({
  wedding,
  role,
  name,
}: {
  wedding: WeddingDto;
  role: 'admin' | 'manager';
  name: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const router = useRouter();
  const [saved, setSaved] = useState(wedding);
  const [draft, setDraft] = useState(() => editable(wedding));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<WeddingDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const discardAction = useRef<(() => void) | null>(null);
  const busy = useRef(false);
  const leaving = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(editable(saved));
  useEffect(() => {
    if (!dirty && !pending) return;
    function unload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function leave(event: MouseEvent) {
      if (leaving.current) return;
      const target =
        event.target instanceof Element
          ? event.target.closest('a,button')
          : null;
      if (
        !target ||
        (!target.matches('a[href]') &&
          !/log\s*out/i.test(target.textContent ?? ''))
      )
        return;
      if (target.matches('a[href^="#"]')) return;
      if (
        target.matches('a') &&
        (event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          target.getAttribute('target') === '_blank')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy.current) return;
      discardAction.current = () => {
        leaving.current = true;
        if (target instanceof HTMLAnchorElement)
          window.location.assign(target.href);
        else if (target instanceof HTMLButtonElement) target.click();
      };
      discardDialog.current?.showModal();
    }
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty, pending]);
  function change(field: string, value: string) {
    leaving.current = false;
    setDraft((current) =>
      ['partnerOne', 'partnerTwo', 'intro'].includes(field)
        ? {
            ...current,
            displayNames: { ...current.displayNames, [field]: value },
          }
        : { ...current, [field]: value },
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setMessage('');
    setFailure('');
  }
  async function loadLatest() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      const response = await fetch('/api/v1/weddings/current', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (!body.data?.wedding) throw new Error();
      if (body.data.wedding.id !== saved.id) {
        setLatest(null);
        setFailure(WEDDING_CONTEXT_CHANGED_MESSAGE);
        return;
      }
      setLatest(body.data.wedding);
      dialog.current?.showModal();
    } catch {
      setFailure(
        'Could not load the latest details. Your draft is still here. Please try again.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !dirty || conflict) return;
    setFailure('');
    setMessage('');
    const result = editWeddingSchema.safeParse(draft);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path.at(-1));
        next[field] =
          field === 'weddingDate'
            ? 'Choose a valid wedding date.'
            : field === 'timezone'
              ? 'Choose a valid planning timezone.'
              : field === 'intro'
                ? 'Use no more than 200 characters.'
                : 'Enter a valid value within the stated limit.';
      }
      setErrors(next);
      const control = form.current?.elements.namedItem(Object.keys(next)[0]);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    setErrors({});
    busy.current = true;
    setPending(true);
    try {
      const submission = await saveWeddingDetails(saved, result.data);
      if (submission.kind === 'signed-out') {
        setFailure(
          'Your session ended. Keep this page open to retain your draft and sign in in another tab.',
        );
        return;
      }
      if (submission.kind === 'wedding-changed') {
        setFailure(WEDDING_CONTEXT_CHANGED_MESSAGE);
        return;
      }
      const response = submission.response;
      if (response.status === 412) {
        setConflict(true);
        return;
      }
      if (!response.ok) {
        setFailure(
          response.status === 429
            ? 'Too many save attempts. Try again in 15 minutes. Your draft is still here.'
            : response.status === 401
              ? 'Your session ended. Sign in in another tab, then retry. Your draft is still here.'
              : 'Could not save your changes. Your draft is still here. Please try again.',
        );
        return;
      }
      const body = await response.json();
      setSaved(body.data.wedding);
      setDraft(editable(body.data.wedding));
      setMessage('Wedding details saved.');
      router.refresh();
    } catch {
      setFailure(
        'Could not confirm the save. Your draft is still here. Retry; if the save completed, we will ask you to load the latest details.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function field(
    field: string,
    label: string,
    value: string,
    type = 'text',
    maxLength?: number,
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={field}>{label} *</label>
        <input
          id={field}
          name={field}
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(event) => change(field, event.target.value)}
          required
          aria-invalid={!!errors[field]}
          aria-describedby={errors[field] ? `${field}-error` : undefined}
        />
        {errors[field] && (
          <p className={styles.fieldError} id={`${field}-error`}>
            {errors[field]}
          </p>
        )}
      </div>
    );
  }
  return (
    <WorkspaceShell wedding={saved} role={role} name={name} active="Settings">
      <div className={styles.settingsMain}>
        <p className={styles.eyebrow}>Settings / Wedding details</p>
        <h1>Wedding details</h1>
        <p className={styles.lead}>
          Keep the essentials of your celebration up to date.
        </p>
        <p className={styles.softNote}>
          Both Admins and Managers can edit these details. Organizer membership
          is managed separately by Admins.
        </p>
        <form
          ref={form}
          onSubmit={submit}
          noValidate
          aria-label="Edit wedding details"
          aria-busy={pending}
        >
          {failure && (
            <p role="alert" className={styles.errorNotice}>
              {failure}
            </p>
          )}
          {Object.keys(errors).length > 0 && (
            <p role="alert" className={styles.fieldError}>
              Please check the highlighted details.
            </p>
          )}
          {conflict && (
            <div role="alert" className={styles.errorNotice}>
              <strong>These details changed since you opened them.</strong>
              <p>
                Your draft has been kept. Load the latest details to review
                before discarding your draft.
              </p>
              <button
                type="button"
                onClick={loadLatest}
                disabled={pending}
                className={styles.textButton}
              >
                {pending ? 'Loading latest details…' : 'Review latest details'}
              </button>
            </div>
          )}
          <fieldset
            disabled={!hydrated || pending}
            className={styles.formFields}
          >
            <legend className={styles.srOnly}>Wedding details</legend>
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <span>01</span>
                <div>
                  <h2>The couple</h2>
                  <p>These names appear across your wedding workspace.</p>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                {field(
                  'partnerOne',
                  'Partner one name',
                  draft.displayNames.partnerOne,
                  'text',
                  100,
                )}
                {field(
                  'partnerTwo',
                  'Partner two name',
                  draft.displayNames.partnerTwo,
                  'text',
                  100,
                )}
              </div>
            </section>
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <span>02</span>
                <div>
                  <h2>Ceremony & destination</h2>
                  <p>The date and setting for your celebration.</p>
                </div>
              </div>
              <div className={styles.fieldGrid}>
                {field(
                  'weddingDate',
                  'Main wedding date',
                  draft.weddingDate,
                  'date',
                )}
                <div className={styles.field}>
                  <label htmlFor="timezone">Planning timezone *</label>
                  <select
                    id="timezone"
                    name="timezone"
                    value={draft.timezone}
                    onChange={(event) => change('timezone', event.target.value)}
                    aria-invalid={!!errors.timezone}
                    aria-describedby="timezone-help timezone-error"
                  >
                    {Array.from(new Set([...zones, saved.timezone])).map(
                      (zone) => (
                        <option key={zone} value={zone}>
                          {zone.replaceAll('_', ' ')}
                        </option>
                      ),
                    )}
                  </select>
                  <p id="timezone-error" className={styles.fieldError}>
                    {errors.timezone}
                  </p>
                </div>
              </div>
              {field(
                'location',
                'Wedding location / destination',
                draft.location,
                'text',
                160,
              )}
              <p id="timezone-help" className={styles.softNote}>
                Changing the main date or planning timezone does not reschedule
                existing functions or change their dates and times.
              </p>
            </section>
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <span>03</span>
                <div>
                  <h2>Introduction</h2>
                  <p>A few words about your celebration.</p>
                </div>
                <small>Optional</small>
              </div>
              <div className={styles.field}>
                <label htmlFor="intro">Short introduction</label>
                <textarea
                  id="intro"
                  name="intro"
                  rows={4}
                  maxLength={200}
                  value={draft.displayNames.intro}
                  onChange={(event) => change('intro', event.target.value)}
                  aria-invalid={!!errors.intro}
                  aria-describedby="intro-count intro-error"
                />
                <small id="intro-count">
                  {draft.displayNames.intro.length} / 200 characters
                </small>
                <p id="intro-error" className={styles.fieldError}>
                  {errors.intro}
                </p>
              </div>
            </section>
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <span>04</span>
                <div>
                  <h2>Wedding address</h2>
                  <p>Read only</p>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="wedding-address">Wedding address</label>
                <input
                  id="wedding-address"
                  value={`/w/${saved.slug}`}
                  readOnly
                />
                <small>
                  Your address stays fixed. Saving these details does not
                  publish your wedding website.
                </small>
              </div>
            </section>
            <div className={styles.settingsActions}>
              <p role="status">
                {pending
                  ? 'Saving or loading details…'
                  : dirty
                    ? 'Unsaved changes'
                    : message || 'All changes saved'}
              </p>
              <button
                type="button"
                className={styles.textButton}
                disabled={!dirty}
                onClick={() => {
                  discardAction.current = () => {
                    setDraft(editable(saved));
                    setErrors({});
                    setFailure('');
                  };
                  discardDialog.current?.showModal();
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!dirty || conflict}
              >
                {pending ? 'Please wait…' : 'Save changes'}
              </button>
            </div>
          </fieldset>
          <noscript>Enable JavaScript to edit your wedding securely.</noscript>
        </form>
        <dialog
          ref={discardDialog}
          className={styles.reviewDialog}
          aria-labelledby="discard-title"
        >
          <h2 id="discard-title">Discard unsaved changes?</h2>
          <p>
            Your unsaved draft will be lost. You can stay here to continue
            editing.
          </p>
          <div className={styles.submitRow}>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => discardDialog.current?.close()}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                discardDialog.current?.close();
                discardAction.current?.();
                discardAction.current = null;
              }}
            >
              Discard changes
            </button>
          </div>
        </dialog>
        <dialog
          ref={dialog}
          className={styles.reviewDialog}
          aria-labelledby="latest-title"
        >
          <h2 id="latest-title">Latest wedding details</h2>
          {latest && (
            <>
              <p>
                {latest.displayNames.partnerOne} &{' '}
                {latest.displayNames.partnerTwo}
              </p>
              <p>
                {latest.weddingDate} · {latest.location}
              </p>
              <p>{latest.timezone}</p>
              <p>{latest.displayNames.intro || 'No introduction'}</p>
            </>
          )}
          <p>Loading these details will discard your unsaved draft.</p>
          <div className={styles.submitRow}>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => dialog.current?.close()}
            >
              Keep my draft
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                if (latest) {
                  setSaved(latest);
                  setDraft(editable(latest));
                  setConflict(false);
                  setErrors({});
                  setFailure('');
                  setMessage('Latest details loaded.');
                }
                dialog.current?.close();
              }}
            >
              Discard draft and load latest
            </button>
          </div>
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
