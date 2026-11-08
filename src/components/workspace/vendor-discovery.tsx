'use client';
import { useRef, useState } from 'react';
import type { EventDto } from '@/modules/events/contracts';
import {
  discoveryCategories,
  discoveryInput,
  savePlaceInput,
  type DiscoveryResult,
  type SavePlaceInput,
} from '@/modules/vendors/discovery-contracts';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { guestCreateAfterFailure } from './guest-request';
import { vendorRequest } from './vendor-request';
import { GoogleListing } from './google-listing';
import styles from './vendors.module.css';
import form from './workspace.module.css';
export type DiscoverySetup = {
  ready: boolean;
  termsUrl: string | null;
  privacyUrl: string | null;
};
export function VendorDiscovery({
  weddingId,
  userId,
  weddingLocation,
  setup,
  initialEvents,
  onSaved,
}: {
  weddingId: string;
  userId: string;
  weddingLocation: string;
  setup: DiscoverySetup;
  initialEvents: { events: EventDto[]; nextCursor: string | null };
  onSaved: () => void;
}) {
  const [category, setCategory] =
    useState<(typeof discoveryCategories)[number]>('Photographer');
  const [source, setSource] = useState<'wedding' | 'function' | 'custom'>(
      'wedding',
    ),
    [eventId, setEventId] = useState(''),
    [location, setLocation] = useState('');
  const [events, setEvents] = useState(initialEvents.events),
    [cursor, setCursor] = useState(initialEvents.nextCursor);
  const [result, setResult] = useState<DiscoveryResult | null>(null),
    [resultCategory, setResultCategory] = useState(category),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [label, setLabel] = useState(''),
    [notes, setNotes] = useState(''),
    [saveError, setSaveError] = useState(''),
    [saving, setSaving] = useState(false),
    [discard, setDiscard] = useState(false),
    [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    attempt = useRef<CreateAttempt<SavePlaceInput> | null>(null),
    uncertain = useRef(false);
  const verify = (data: { weddingId: string }) => {
    if (data.weddingId !== weddingId)
      throw new Error('Your wedding changed. Reload before continuing.');
  };
  async function search() {
    if (busy.current) return;
    setError('');
    setNotice('');
    let query;
    try {
      query = discoveryInput.parse({
        category,
        locationSource: source,
        ...(source === 'function' ? { eventId } : {}),
        ...(source === 'custom' ? { location } : {}),
      });
    } catch {
      setError('Choose a category and a complete search location.');
      return;
    }
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const params = new URLSearchParams(
        Object.entries(query).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const data = await vendorRequest('/api/v1/vendors/discover?' + params, {
        cache: 'no-store',
        headers: { 'X-Wedding-Context': weddingId },
      });
      verify(data);
      setResult(data);
      setResultCategory(category);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not search Google. Retry shortly.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function moreFunctions() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const data = await vendorRequest(
        '/api/v1/events?cursor=' + encodeURIComponent(cursor),
        { cache: 'no-store' },
      );
      verify(data);
      setEvents((old) => [...old, ...data.events]);
      setCursor(data.nextCursor);
    } catch {
      setError('Could not load more functions. Retry shortly.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function open(id: string) {
    setSelected(id);
    setLabel('');
    setNotes('');
    setSaveError('');
    setDiscard(false);
    attempt.current = null;
    uncertain.current = false;
    dialog.current?.showModal();
  }
  function close() {
    if (saving) return;
    if (label || notes || attempt.current) setDiscard(true);
    else dialog.current?.close();
  }
  async function save() {
    if (!selected || busy.current) return;
    let current;
    try {
      current = prepareCreate(
        attempt.current,
        savePlaceInput.parse({
          googlePlaceId: selected,
          name: label,
          category: resultCategory,
          notes,
        }),
      );
      attempt.current = current;
    } catch {
      setSaveError(
        'Enter your own label. If a previous save is unresolved, retry the same details first.',
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setSaveError('');
    let dispatched = false;
    try {
      const session = await vendorRequest('/api/v1/auth/session', {
        cache: 'no-store',
      });
      if (session.user?.id !== userId || session.user?.weddingId !== weddingId)
        throw new Error(
          'Your account or wedding changed. Reload before saving.',
        );
      dispatched = true;
      const data = await vendorRequest(
        '/api/v1/vendors/from-google',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wedding-Context': weddingId,
            'X-CSRF-Token': session.csrfToken,
            'Idempotency-Key': current.key,
          },
          body: JSON.stringify(current.body),
        },
        'save',
      );
      verify(data);
      attempt.current = null;
      uncertain.current = false;
      setResult(
        (old) =>
          old && {
            ...old,
            places: old.places.map((p) =>
              p.id === selected ? { ...p, savedVendorId: data.vendor.id } : p,
            ),
          },
      );
      dialog.current?.close();
      setNotice(
        data.alreadySaved
          ? 'This listing is already in your directory. Existing notes were kept.'
          : 'Google reference saved with your label and notes.',
      );
      onSaved();
    } catch (e) {
      const next = guestCreateAfterFailure(
        attempt.current,
        e,
        uncertain.current,
        dispatched,
      );
      attempt.current = next.attempt;
      uncertain.current = next.uncertain;
      setSaveError(
        e instanceof Error
          ? e.message
          : 'Could not save. Your label and notes are kept.',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <section className={styles.discovery} aria-labelledby="discovery-heading">
      <p className={form.eyebrow}>Find specialists for your celebration</p>
      <h2 id="discovery-heading">Discover wedding vendors</h2>
      <p>
        Search around a location you choose. Results are supplied by Google;
        availability and bookings must be confirmed with the vendor.
      </p>
      {!setup.ready && (
        <p role="status" className={styles.notice}>
          Google discovery setup is pending. You can continue adding and
          managing manual vendors.
        </p>
      )}
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <fieldset disabled={pending || !setup.ready} className={styles.fields}>
          <div className={styles.filterFields}>
            <label htmlFor="discovery-category">
              Vendor category
              <select
                id="discovery-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {discoveryCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label htmlFor="discovery-source">
              Search location
              <select
                id="discovery-source"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
              >
                <option value="wedding">
                  Wedding location · {weddingLocation}
                </option>
                <option value="function">A wedding function</option>
                <option value="custom">Enter another area</option>
              </select>
            </label>
            {source === 'function' && (
              <label htmlFor="discovery-event">
                Function
                <select
                  id="discovery-event"
                  required
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">Choose a function</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} · {event.venue.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {source === 'custom' && (
              <label htmlFor="discovery-area">
                City or area
                <input
                  id="discovery-area"
                  required
                  maxLength={500}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bani Park, Jaipur, India"
                />
              </label>
            )}
          </div>
          <div className={styles.actions}>
            <button className={form.primaryButton}>
              {pending ? 'Searching…' : 'Search Google'}
            </button>
            {source === 'function' && cursor && (
              <button
                type="button"
                className={form.textButton}
                onClick={() => void moreFunctions()}
              >
                Load more functions
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className={form.errorNotice}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <div>
          <p>
            Results for {resultCategory} near {result.location}. Up to 10
            matches, in Google’s order.
          </p>
          {!result.places.length && (
            <p role="status">
              No matching listings found. Try another category or area.
            </p>
          )}
          <div className={styles.grid}>
            {result.places.map((place) => (
              <article className={styles.card} key={place.id}>
                <GoogleListing place={place} />
                <button
                  type="button"
                  className={form.primaryButton}
                  disabled={!!place.savedVendorId || saving}
                  onClick={() => open(place.id)}
                >
                  {place.savedVendorId ? 'Already saved' : 'Save reference'}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
      <p className={styles.helper}>
        Search results are kept only while you view this page. Saved references
        keep the Place ID and your own label/notes.
      </p>
      {setup.termsUrl && setup.privacyUrl && (
        <p className={styles.helper}>
          <a href={setup.termsUrl} target="_blank" rel="noopener noreferrer">
            Terms of Use
          </a>{' '}
          ·{' '}
          <a href={setup.privacyUrl} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
        </p>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="save-google-heading"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2 id="save-google-heading">Save Google reference</h2>
        {saveError && (
          <p role="alert" className={form.formError}>
            {saveError}
          </p>
        )}
        {discard ? (
          <div>
            <p>
              Discard your label and notes? An unresolved save may already have
              completed; check your directory before starting again.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={form.textButton}
                onClick={() => setDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className={form.primaryButton}
                onClick={() => {
                  attempt.current = null;
                  uncertain.current = false;
                  dialog.current?.close();
                }}
              >
                Discard draft
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={saving} className={styles.fields}>
              <p>
                Write your own label and notes. Google listing details stay
                separate and can be loaded fresh from your directory.
              </p>
              <div className={form.field}>
                <label htmlFor="google-vendor-label">Your label</label>
                <input
                  id="google-vendor-label"
                  required
                  maxLength={160}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Photographer to discuss with family"
                />
              </div>
              <div className={form.field}>
                <label htmlFor="google-vendor-notes">
                  Team notes (optional)
                </label>
                <textarea
                  id="google-vendor-notes"
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={form.textButton}
                  onClick={close}
                >
                  Cancel
                </button>
                <button className={form.primaryButton}>
                  {saving ? 'Saving…' : 'Save reference'}
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </dialog>
    </section>
  );
}
