'use client';
import { useRef, useState } from 'react';
import type { WeddingDto } from '@/modules/weddings/contracts';
import {
  vendorInput,
  type VendorDto,
  type VendorPage,
  type VendorInput,
} from '@/modules/vendors/contracts';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import { guestCreateAfterFailure } from './guest-request';
import { WorkspaceShell } from './workspace-shell';
import styles from './vendors.module.css';
import { vendorRequest } from './vendor-request';
import form from './workspace.module.css';
const blank: VendorInput = {
  name: '',
  category: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  notes: '',
};
function rowToInput(row: VendorDto): VendorInput {
  const { name, category, phone, email, website, address, notes } = row;
  return { name, category, phone, email, website, address, notes };
}
export function Vendors({
  wedding,
  name,
  role,
  userId,
  initial,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
  initial: VendorPage;
}) {
  const [page, setPage] = useState(initial),
    [query, setQuery] = useState(''),
    [filters, setFilters] = useState({ search: '', category: '' }),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<VendorDto | null>(null),
    [draft, setDraft] = useState(blank),
    [baseline, setBaseline] = useState(blank),
    [confirm, setConfirm] = useState<'discard' | 'remove' | 'latest' | null>(
      null,
    );
  const dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    sequence = useRef(0),
    attempt = useRef<CreateAttempt<VendorInput> | null>(null),
    uncertain = useRef(false);
  function verify(data: { weddingId: string }) {
    if (data.weddingId !== wedding.id)
      throw new Error('Your wedding changed. Reload before continuing.');
  }
  async function load(value = query, append = false) {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams(value);
      if (append && page.nextCursor) params.set('cursor', page.nextCursor);
      const data: VendorPage = await vendorRequest(
        '/api/v1/vendors?' + params,
        { cache: 'no-store' },
      );
      verify(data);
      if (request === sequence.current) {
        setPage((old) => ({
          ...data,
          vendors: append ? [...old.vendors, ...data.vendors] : data.vendors,
        }));
        setQuery(value);
        setError('');
        return true;
      }
    } catch {
      if (request === sequence.current)
        setError('Could not load vendors. Check your connection and retry.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
    return false;
  }
  function open(row: VendorDto | null) {
    attempt.current = null;
    uncertain.current = false;
    const value = row ? vendorInput.parse(rowToInput(row)) : { ...blank };
    setDraft(value);
    setBaseline(value);
    setSelected(row);
    setConfirm(null);
    setError('');
    dialog.current?.showModal();
  }
  function close() {
    if (pending) return;
    if (attempt.current || JSON.stringify(draft) !== JSON.stringify(baseline))
      setConfirm('discard');
    else dialog.current?.close();
  }
  async function authorization() {
    const session = await vendorRequest('/api/v1/auth/session', {
      cache: 'no-store',
    });
    if (session.user?.id !== userId || session.user?.weddingId !== wedding.id)
      throw new Error('Your account or wedding changed. Reload before saving.');
    return {
      'X-CSRF-Token': session.csrfToken,
      'X-Wedding-Context': wedding.id,
    };
  }
  async function save(remove = false) {
    if (busy.current) return;
    let body: VendorInput | undefined;
    try {
      if (!remove) body = vendorInput.parse(draft);
      if (!selected) attempt.current = prepareCreate(attempt.current, body!);
    } catch {
      setError(
        'Check the vendor name, category and contact details. Websites need a full http:// or https:// address. If a previous save is unresolved, retry its unchanged details first.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    let dispatched = false;
    try {
      const auth = await authorization();
      dispatched = true;
      const result = await vendorRequest(
        '/api/v1/vendors' + (selected ? '/' + selected.id : ''),
        {
          method: remove ? 'DELETE' : selected ? 'PATCH' : 'POST',
          headers: {
            ...auth,
            ...(selected
              ? { 'If-Match': '"' + selected.version + '"' }
              : { 'Idempotency-Key': attempt.current!.key }),
            ...(!remove ? { 'Content-Type': 'application/json' } : {}),
          },
          body: remove ? undefined : JSON.stringify(body),
        },
        remove ? 'remove' : 'save',
      );
      verify(result);
      attempt.current = null;
      uncertain.current = false;
      dialog.current?.close();
      setConfirm(null);
      setNotice(remove ? 'Vendor removed.' : 'Vendor saved.');
      void load();
    } catch (e) {
      if (!selected) {
        const next = guestCreateAfterFailure(
          attempt.current,
          e,
          uncertain.current,
          dispatched,
        );
        attempt.current = next.attempt;
        uncertain.current = next.uncertain;
      }
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save vendor. Your draft is kept.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function latest() {
    if (!selected) return;
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const data = await vendorRequest('/api/v1/vendors/' + selected.id, {
        cache: 'no-store',
      });
      verify(data);
      open(data.vendor);
    } catch {
      setError('Could not load the latest vendor. Your draft is kept.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function reviewRemoval() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      if (await load()) {
        dialog.current?.close();
        setConfirm(null);
        setSelected(null);
        setNotice(
          'Directory refreshed. Review the saved vendors before removing again.',
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <WorkspaceShell wedding={wedding} name={name} role={role} active="Vendors">
      <div className={styles.container}>
        <header className={styles.heading}>
          <div>
            <p className={form.eyebrow}>The people behind your celebration</p>
            <h1>Saved wedding vendors</h1>
            <p>Keep trusted contacts and planning notes together.</p>
          </div>
          <button className={form.primaryButton} onClick={() => open(null)}>
            Add manual vendor
          </button>
        </header>
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        <section className={styles.summary} aria-label="Saved vendor summary">
          <div>
            <span className={styles.summaryNumber}>{page.total}</span>
            <span>
              saved {page.total === 1 ? 'vendor' : 'vendors'} · current filters
            </span>
          </div>
          <p>Organizer-entered contacts. Visible only to your wedding team.</p>
        </section>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault();
            const params = new URLSearchParams();
            if (filters.search) params.set('search', filters.search);
            if (filters.category) params.set('category', filters.category);
            void load(params.toString());
          }}
        >
          <div className={styles.filterFields}>
            <label htmlFor="vendor-search">
              Search by vendor name
              <input
                id="vendor-search"
                type="search"
                maxLength={160}
                value={filters.search}
                onChange={(e) =>
                  setFilters((v) => ({ ...v, search: e.target.value }))
                }
                placeholder="Find a saved contact…"
              />
            </label>
            <label htmlFor="vendor-filter-category">
              Category
              <input
                id="vendor-filter-category"
                maxLength={80}
                list="vendor-categories"
                value={filters.category}
                onChange={(e) =>
                  setFilters((v) => ({ ...v, category: e.target.value }))
                }
                placeholder="All categories"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button className={form.primaryButton} disabled={loading}>
              Apply filters
            </button>
            <button
              type="button"
              className={form.textButton}
              disabled={loading}
              onClick={() => {
                setFilters({ search: '', category: '' });
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
              Refresh
            </button>
          </div>
        </form>
        <datalist id="vendor-categories">
          {[
            'Venue',
            'Photography',
            'Catering',
            'Decor',
            'Music',
            'Makeup',
            'Other',
          ].map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <section aria-label="Saved vendors" aria-busy={loading}>
          {!page.vendors.length ? (
            <div className={styles.empty}>
              <h2>
                {query
                  ? 'No vendors match these filters'
                  : 'A little directory for your big day'}
              </h2>
              <p>
                {query
                  ? 'Try another name or category, or reset the filters.'
                  : 'Save your first vendor so everyone on your team knows who to contact.'}
              </p>
              {!query && (
                <button
                  className={form.primaryButton}
                  onClick={() => open(null)}
                >
                  Add your first vendor
                </button>
              )}
            </div>
          ) : (
            <div className={styles.grid}>
              {page.vendors.map((row) => (
                <article className={styles.card} key={row.id}>
                  <div className={styles.cardTop}>
                    <span className={styles.category}>{row.category}</span>
                    <small>Manual record</small>
                  </div>
                  <h2>{row.name}</h2>
                  {row.address && (
                    <p className={styles.address}>{row.address}</p>
                  )}
                  <div className={styles.contacts}>
                    {row.phone && (
                      <a href={'tel:' + row.phone.replace(/[^+0-9]/g, '')}>
                        Call · {row.phone}
                      </a>
                    )}
                    {row.email && (
                      <a href={'mailto:' + row.email}>Email · {row.email}</a>
                    )}
                    {row.website && (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        Visit website ↗
                      </a>
                    )}
                    {!row.phone && !row.email && !row.website && (
                      <p>Contact details not added yet.</p>
                    )}
                  </div>
                  {row.notes && (
                    <div className={styles.notes}>
                      <small>Team notes</small>
                      <p>{row.notes}</p>
                    </div>
                  )}
                  <button
                    className={form.textButton}
                    onClick={() => open(row)}
                    aria-label={'View or edit ' + row.name}
                  >
                    View details / edit
                  </button>
                </article>
              ))}
            </div>
          )}
          {page.nextCursor && (
            <button
              className={form.textButton}
              disabled={loading}
              onClick={() => void load(query, true)}
            >
              Load more vendors
            </button>
          )}
        </section>
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby="vendor-heading"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div className={styles.dialogHeading}>
            <p className={form.eyebrow}>Your wedding directory</p>
            <h2 id="vendor-heading">
              {selected ? 'Vendor details' : 'Add a manual vendor'}
            </h2>
          </div>
          {error && (
            <p role="alert" className={form.formError}>
              {error}
            </p>
          )}
          {confirm ? (
            <div className={styles.confirm}>
              {pending && (
                <p role="status">
                  {confirm === 'remove'
                    ? 'Removing vendor… Please wait for confirmation.'
                    : 'Loading…'}
                </p>
              )}
              <p>
                {confirm === 'discard'
                  ? 'Discard this draft? If a save is unresolved, it may already have succeeded. Refresh the directory before adding it again.'
                  : confirm === 'remove'
                    ? 'Remove this vendor from your saved directory? Existing expense records will be kept.'
                    : 'Discard your draft and review the latest saved details?'}
              </p>
              <div className={styles.actions}>
                {confirm === 'remove' && error && (
                  <button
                    type="button"
                    className={form.textButton}
                    disabled={pending}
                    onClick={() => void reviewRemoval()}
                  >
                    Refresh directory and review
                  </button>
                )}
                <button
                  type="button"
                  className={form.textButton}
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className={form.primaryButton}
                  disabled={pending}
                  onClick={() => {
                    if (confirm === 'remove') void save(true);
                    else if (confirm === 'latest') void latest();
                    else {
                      attempt.current = null;
                      uncertain.current = false;
                      dialog.current?.close();
                      setConfirm(null);
                    }
                  }}
                >
                  {pending ? 'Working…' : 'Confirm'}
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
              <fieldset disabled={pending} className={styles.fields}>
                <div className={styles.formGrid}>
                  {(
                    [
                      'name',
                      'category',
                      'phone',
                      'email',
                      'website',
                      'address',
                      'notes',
                    ] as const
                  ).map((key) => (
                    <div
                      className={
                        key === 'address' || key === 'notes'
                          ? styles.wideField
                          : form.field
                      }
                      key={key}
                    >
                      <label htmlFor={'vendor-' + key}>
                        {
                          {
                            name: 'Vendor name',
                            category: 'Category',
                            phone: 'Phone (optional)',
                            email: 'Email (optional)',
                            website: 'Website (optional)',
                            address: 'Address (optional)',
                            notes: 'Team notes (optional)',
                          }[key]
                        }
                      </label>
                      {key === 'notes' || key === 'address' ? (
                        <textarea
                          id={'vendor-' + key}
                          value={draft[key]}
                          maxLength={key === 'notes' ? 2000 : 500}
                          rows={key === 'notes' ? 4 : 2}
                          onChange={(e) =>
                            setDraft((v) => ({ ...v, [key]: e.target.value }))
                          }
                        />
                      ) : (
                        <input
                          id={'vendor-' + key}
                          type={
                            key === 'email'
                              ? 'email'
                              : key === 'website'
                                ? 'url'
                                : key === 'phone'
                                  ? 'tel'
                                  : 'text'
                          }
                          required={key === 'name' || key === 'category'}
                          value={draft[key]}
                          maxLength={
                            key === 'name'
                              ? 160
                              : key === 'phone'
                                ? 40
                                : key === 'email'
                                  ? 254
                                  : key === 'website'
                                    ? 2048
                                    : 80
                          }
                          list={
                            key === 'category' ? 'vendor-categories' : undefined
                          }
                          placeholder={
                            key === 'website' ? 'https://…' : undefined
                          }
                          onChange={(e) =>
                            setDraft((v) => ({ ...v, [key]: e.target.value }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
                <p className={styles.helper}>
                  Saved for your team’s reference. Contacting a vendor does not
                  make a booking through ShaadiPilot.
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={form.textButton}
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button className={form.primaryButton}>
                    {pending ? 'Saving…' : 'Save vendor'}
                  </button>
                  {selected && (
                    <>
                      <button
                        type="button"
                        className={form.textButton}
                        onClick={() => setConfirm('latest')}
                      >
                        Load latest details
                      </button>
                      <button
                        type="button"
                        className={form.textButton}
                        onClick={() => setConfirm('remove')}
                      >
                        Remove vendor
                      </button>
                    </>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
