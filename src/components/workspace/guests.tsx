'use client';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { WorkspaceShell } from './workspace-shell';
import type { WeddingDto } from '@/modules/weddings/contracts';
import type { EventDto } from '@/modules/events/contracts';
import type { GuestDto, GuestInput } from '@/modules/guests/contracts';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { readGuestDraft, guestDraftChanged } from './guest-draft';
import {
  guestResponseData as responseData,
  guestCreateAfterFailure,
} from './guest-request';
import { loadedGuestPage, type GuestPage as Page } from './guest-list';
import shared from './team.module.css';
import styles from './guests.module.css';
import form from './workspace.module.css';
export function Guests({
  wedding,
  name,
  role,
  userId,
  initialList,
  initialEvents,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
  initialList: Page;
  initialEvents: { events: EventDto[]; nextCursor: string | null };
}) {
  const [listing, setListing] = useState({ ...initialList, query: '' });
  const { guests: rows, summary, nextCursor: cursor, query } = listing;
  const [filterValues, setFilterValues] = useState({ search: '', eventId: '' });
  const [events, setEvents] = useState(initialEvents.events),
    [eventCursor, setEventCursor] = useState(initialEvents.nextCursor);
  const [selected, setSelected] = useState<GuestDto | null>(null),
    [editing, setEditing] = useState(false),
    [generation, setGeneration] = useState(0),
    [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [optionLoading, setOptionLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirmation, setConfirmation] = useState<
      'discard' | 'archive' | 'latest' | null
    >(null),
    [duplicateDraft, setDuplicateDraft] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    fields = useRef<HTMLFormElement>(null),
    busy = useRef(false),
    sequence = useRef(0),
    creation = useRef<CreateAttempt<GuestInput> | null>(null),
    uncertainCreate = useRef(false);
  function verifyTenant(data: { weddingId: string }) {
    if (data.weddingId !== wedding.id)
      throw new Error(
        'Your wedding changed. Reload this workspace before continuing.',
      );
  }
  async function load(filters = query, after?: string | null) {
    const attempt = ++sequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      if (after) params.set('cursor', after);
      const data = await responseData(
        fetch('/api/v1/guest-contacts?' + params, { cache: 'no-store' }),
      );
      verifyTenant(data);
      if (attempt !== sequence.current) return;
      setListing((previous) =>
        loadedGuestPage(previous, data, filters, !!after),
      );
      setError('');
    } catch (e) {
      if (attempt === sequence.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load the guest directory.',
        );
    } finally {
      if (attempt === sequence.current) setLoading(false);
    }
  }
  async function loadEvents() {
    if (!eventCursor || optionLoading) return;
    setOptionLoading(true);
    try {
      const data = await responseData(
        fetch('/api/v1/events?cursor=' + encodeURIComponent(eventCursor), {
          cache: 'no-store',
        }),
      );
      verifyTenant(data);
      setEvents((previous) => [...previous, ...data.events]);
      setEventCursor(data.nextCursor);
    } catch {
      setError('Could not load more functions. Try again.');
    } finally {
      setOptionLoading(false);
    }
  }
  function open(row: GuestDto | null, edit: boolean) {
    creation.current = null;
    uncertainCreate.current = false;
    setSelected(row);
    setEditing(edit);
    setGeneration((v) => v + 1);
    setConfirmation(null);
    setDuplicateDraft(row?.duplicateEmail ?? false);
    setError('');
    setModalOpen(true);
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    setConfirmation(null);
    void load();
  }
  function requestClose() {
    if (pending) return;
    // Escape dismisses the inline confirmation first. Its hidden form is
    // disabled, so reading FormData here would incorrectly look like a blank draft.
    if (confirmation) {
      setConfirmation(null);
      return;
    }
    if (
      editing &&
      (creation.current ||
        (fields.current &&
          guestDraftChanged(new FormData(fields.current), selected)))
    ) {
      setConfirmation('discard');
    } else close();
  }
  async function latest() {
    if (!selected) return;
    setPending(true);
    try {
      const data = await responseData(
        fetch('/api/v1/guest-contacts/' + selected.id, {
          cache: 'no-store',
        }),
      );
      verifyTenant(data);
      setSelected(data.guest);
      setGeneration((v) => v + 1);
      setDuplicateDraft(data.guest.duplicateEmail);
      setError('');
      setConfirmation(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reload this guest.');
    } finally {
      setPending(false);
    }
  }
  async function write(archive = false) {
    if (busy.current) return;
    let createDispatched = false;
    let body: GuestInput | undefined;
    try {
      if (!archive) body = readGuestDraft(new FormData(fields.current!));
      if (!selected && !archive)
        creation.current = prepareCreate(creation.current, body!);
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : 'Check the guest fields.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const session = await responseData(
        fetch('/api/v1/auth/session', { cache: 'no-store' }),
        'save',
      );
      if (session.user?.id !== userId || session.user?.weddingId !== wedding.id)
        throw new Error(
          'Your account or wedding changed. Reload before saving.',
        );
      createDispatched = !selected && !archive;
      const data = await responseData(
        fetch('/api/v1/guest-contacts' + (selected ? '/' + selected.id : ''), {
          method: archive ? 'DELETE' : selected ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrfToken,
            'X-Wedding-Context': wedding.id,
            ...(selected
              ? { 'If-Match': '"' + selected.version + '"' }
              : { 'Idempotency-Key': creation.current!.key }),
          },
          ...(archive ? {} : { body: JSON.stringify(body) }),
        }),
        'save',
      );
      if (!data?.guest || typeof data.guest.id !== 'string')
        throw new Error(
          'We couldn’t confirm the save response. Your draft is kept. Retry the same details before starting another guest.',
        );
      creation.current = null;
      uncertainCreate.current = false;
      dialog.current?.close();
      setConfirmation(null);
      setNotice(
        archive
          ? 'Guest contact removed.'
          : data.guest.duplicateEmail
            ? 'Guest saved. Another contact shares this email; both records remain separate.'
            : 'Guest contact saved. No invitation has been sent.',
      );
      await load();
    } catch (e) {
      if (!selected && !archive) {
        const outcome = guestCreateAfterFailure(
          creation.current,
          e,
          uncertainCreate.current,
          createDispatched,
        );
        creation.current = outcome.attempt;
        uncertainCreate.current = outcome.uncertain;
      }
      setError(
        e instanceof Error ? e.message : 'Could not save. Your draft is kept.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const choices = [
    ...events.map((e) => ({ id: e.id, title: e.title })),
    ...(selected?.selectedEvents ?? []).filter(
      (e) => !events.some((v) => v.id === e.id),
    ),
  ];
  return (
    <WorkspaceShell
      wedding={wedding}
      name={name}
      role={role}
      active="Guests & RSVPs"
    >
      <div className={shared.container}>
        <div className={shared.heading}>
          <div>
            <p className={form.eyebrow}>Your people, thoughtfully organized</p>
            <h1>Guest Directory</h1>
            <p>
              One contact for each primary invitee. Keep family details and
              function selections together.
            </p>
          </div>
          <button
            className={form.primaryButton}
            disabled={pending}
            onClick={() => open(null, true)}
          >
            Add Guest
          </button>
        </div>
        {notice && (
          <p role="status" className={shared.notice}>
            {notice}
          </p>
        )}
        {error && !modalOpen && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        <section className={styles.summary} aria-label="Guest contact summary">
          <article>
            <h2>Primary guest contacts</h2>
            <strong>{summary.total}</strong>
            <p>Separate contacts, including shared family emails</p>
          </article>
          <article>
            <h2>Functions selected</h2>
            <strong>{summary.withFunctions}</strong>
            <p>Contacts with one or more planned functions</p>
          </article>
        </section>
        <p className={shared.permissionNote}>
          Function selections are planning only. Private invitation links, email
          sending and per-function RSVP will be available in the next feature.
        </p>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget),
              params = new URLSearchParams();
            for (const key of ['search', 'eventId']) {
              const value = String(fields.get(key) ?? '').trim();
              if (value) params.set(key, value);
            }
            void load(params.toString());
          }}
        >
          <div className={styles.filterGrid}>
            <label>
              Search name or email
              <input
                name="search"
                type="search"
                maxLength={160}
                placeholder="Find a guest contact"
                value={filterValues.search}
                onChange={(e) => {
                  const search = e.currentTarget.value;
                  setFilterValues((previous) => ({ ...previous, search }));
                }}
              />
            </label>
            <label>
              Selected function
              <select
                name="eventId"
                value={filterValues.eventId}
                onChange={(e) => {
                  const eventId = e.currentTarget.value;
                  setFilterValues((previous) => ({ ...previous, eventId }));
                }}
              >
                <option value="">All functions</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
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
                setFilterValues({ search: '', eventId: '' });
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
              Refresh guests
            </button>
            {eventCursor && (
              <button
                type="button"
                className={form.textButton}
                disabled={optionLoading}
                onClick={() => void loadEvents()}
              >
                Load more functions
              </button>
            )}
          </div>
        </form>
        <section
          className={styles.registry}
          aria-label="Guest contacts"
          aria-busy={loading}
        >
          <div className={styles.tableHeading}>
            <span>Primary guest & email</span>
            <span>Contact details</span>
            <span>Selected functions</span>
            <span>Actions</span>
          </div>
          {loading && <p role="status">Loading guest contacts…</p>}
          {!loading && rows.length === 0 && (
            <div className={shared.empty}>
              <h2>
                {query
                  ? 'No guests match these filters'
                  : 'A place for everyone who matters'}
              </h2>
              <p>
                {query
                  ? 'Try a different name, email or function.'
                  : 'Add your first primary invitee to start the guest list.'}
              </p>
            </div>
          )}
          {rows.map((guest) => (
            <article key={guest.id} className={styles.row}>
              <div className={styles.identity}>
                <span className={shared.avatar} aria-hidden="true">
                  {guest.displayName.slice(0, 1)}
                </span>
                <div>
                  <h2>{guest.displayName}</h2>
                  <p>{guest.email}</p>
                  {guest.duplicateEmail && (
                    <span className={styles.warning}>
                      Shared email · separate contact
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p>{guest.phone || 'No phone added'}</p>
                <p className={styles.notes}>
                  {guest.notes || 'No notes added'}
                </p>
              </div>
              <div>
                {guest.selectedEvents.length ? (
                  guest.selectedEvents.map((event) => (
                    <span className={styles.badge} key={event.id}>
                      {event.title}
                    </span>
                  ))
                ) : (
                  <p>No functions selected</p>
                )}
              </div>
              <div className={styles.rowActions}>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => open(guest, false)}
                >
                  Details
                  <span className={form.srOnly}> for {guest.displayName}</span>
                </button>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => open(guest, true)}
                >
                  Edit<span className={form.srOnly}> {guest.displayName}</span>
                </button>
              </div>
            </article>
          ))}
        </section>
        {cursor && (
          <button
            className={form.textButton}
            disabled={loading}
            onClick={() => void load(query, cursor)}
          >
            Load more guests
          </button>
        )}
        <dialog
          ref={dialog}
          className={`${shared.dialog} ${styles.guestDialog}`}
          aria-labelledby="guest-title"
          onClose={() => {
            fields.current?.reset();
            setGeneration((v) => v + 1);
            setModalOpen(false);
          }}
          onCancel={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          <p className={form.eyebrow}>
            Primary invitee · Private wedding record
          </p>
          <h2 id="guest-title">
            {editing
              ? selected
                ? 'Edit Guest'
                : 'Add Guest'
              : selected?.displayName}
          </h2>
          {error && (
            <div className={form.errorNotice} role="alert">
              <p>{error}</p>
              {selected && (
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => setConfirmation('latest')}
                >
                  Load latest details
                </button>
              )}
            </div>
          )}
          {confirmation && (
            <section
              className={styles.confirmation}
              role="group"
              aria-label="Confirm action"
            >
              <h3>
                {confirmation === 'archive'
                  ? 'Remove this guest contact?'
                  : confirmation === 'latest'
                    ? 'Load the latest contact?'
                    : 'Discard unsaved guest changes?'}
              </h3>
              <p>
                {confirmation === 'archive'
                  ? 'This removes the contact from active planning and preserves its history. Existing private access records block this action until the revocation workflow is available.'
                  : confirmation === 'latest'
                    ? 'Your current draft will be discarded. Review the latest version before editing again.'
                    : 'Your unsaved changes will be discarded. If you attempted a save, check the refreshed directory before adding another contact.'}
              </p>
              <div className={styles.toolbar}>
                <button
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => setConfirmation(null)}
                >
                  Keep {confirmation === 'archive' ? 'guest' : 'draft'}
                </button>
                <button
                  className={form.primaryButton}
                  disabled={pending}
                  onClick={() => {
                    if (confirmation === 'archive') void write(true);
                    else if (confirmation === 'latest') void latest();
                    else close();
                  }}
                >
                  {pending
                    ? 'Working…'
                    : confirmation === 'archive'
                      ? 'Remove guest'
                      : confirmation === 'latest'
                        ? 'Load latest'
                        : 'Discard changes'}
                </button>
              </div>
            </section>
          )}
          <div hidden={confirmation !== null}>
            {editing ? (
              <form
                ref={fields}
                key={generation}
                onSubmit={(e) => {
                  e.preventDefault();
                  void write();
                }}
              >
                <fieldset
                  disabled={pending || confirmation !== null}
                  className={form.formFields}
                >
                  <legend className={form.srOnly}>Guest contact details</legend>
                  <div className={form.field}>
                    <label htmlFor="guest-name">Primary guest name</label>
                    <input
                      id="guest-name"
                      name="displayName"
                      required
                      maxLength={160}
                      defaultValue={selected?.displayName ?? ''}
                    />
                  </div>
                  <div className={styles.filterGrid}>
                    <div className={form.field}>
                      <label htmlFor="guest-email">Email address</label>
                      <input
                        id="guest-email"
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        defaultValue={selected?.email ?? ''}
                        onChange={(e) => {
                          const email = e.currentTarget.value
                            .trim()
                            .toLowerCase();
                          setDuplicateDraft(
                            rows.some(
                              (row) =>
                                row.id !== selected?.id && row.email === email,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div className={form.field}>
                      <label htmlFor="guest-phone">Phone (optional)</label>
                      <input
                        id="guest-phone"
                        name="phone"
                        type="tel"
                        maxLength={40}
                        defaultValue={selected?.phone ?? ''}
                      />
                    </div>
                  </div>
                  {duplicateDraft && (
                    <p role="status" className={styles.warning}>
                      Another contact uses this email. You can save both; they
                      will stay separate. Review the directory to avoid an
                      accidental duplicate.
                    </p>
                  )}
                  <p className={styles.help}>
                    Email is required. Shared family addresses are allowed.
                    Saving this contact sends no email.
                  </p>
                  <fieldset className={styles.functionChoices}>
                    <legend>Selected functions (optional)</legend>
                    <p>
                      Plan which celebrations to invite this guest to. This
                      selection does not send an invitation or grant access.
                    </p>
                    {choices.map((event) => (
                      <label key={event.id}>
                        <input
                          type="checkbox"
                          name="selectedEventIds"
                          value={event.id}
                          defaultChecked={
                            selected?.selectedEventIds.includes(event.id) ??
                            false
                          }
                        />
                        <span>{event.title}</span>
                      </label>
                    ))}
                    {!choices.length && (
                      <p>
                        Add a wedding function first, or save this guest without
                        a selection.
                      </p>
                    )}
                    {eventCursor && (
                      <button
                        className={form.textButton}
                        type="button"
                        disabled={optionLoading}
                        onClick={() => void loadEvents()}
                      >
                        Load more functions
                      </button>
                    )}
                  </fieldset>
                  <div className={form.field}>
                    <label htmlFor="guest-notes">
                      Internal notes (optional)
                    </label>
                    <textarea
                      id="guest-notes"
                      name="notes"
                      maxLength={2000}
                      rows={4}
                      defaultValue={selected?.notes ?? ''}
                    />
                  </div>
                  <div className={shared.actions}>
                    <button
                      className={form.textButton}
                      type="button"
                      onClick={requestClose}
                    >
                      Cancel
                    </button>
                    <button className={form.primaryButton} type="submit">
                      {pending ? 'Saving…' : 'Save guest'}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              selected && (
                <>
                  <dl className={styles.details}>
                    <dt>Email</dt>
                    <dd>{selected.email}</dd>
                    <dt>Phone</dt>
                    <dd>{selected.phone || 'Not added'}</dd>
                    <dt>Internal notes</dt>
                    <dd>{selected.notes || 'No notes added'}</dd>
                  </dl>
                  {selected.duplicateEmail && (
                    <p className={styles.warning}>
                      This email is shared with another contact. Records remain
                      separate.
                    </p>
                  )}
                  <h3>Selected functions</h3>
                  {selected.selectedEvents.length ? (
                    selected.selectedEvents.map((event) => (
                      <p key={event.id} className={styles.badge}>
                        {event.title}
                      </p>
                    ))
                  ) : (
                    <p>No functions selected.</p>
                  )}
                  <p className={styles.help}>
                    Planning selection only. No guest links or invitations are
                    created in this feature.
                  </p>
                  <div className={shared.actions}>
                    <button
                      className={form.textButton}
                      disabled={pending}
                      onClick={close}
                    >
                      Close
                    </button>
                    <button
                      className={form.primaryButton}
                      disabled={pending}
                      onClick={() => setEditing(true)}
                    >
                      Edit contact
                    </button>
                    <button
                      className={form.textButton}
                      disabled={pending}
                      onClick={() => setConfirmation('archive')}
                    >
                      Remove guest
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
