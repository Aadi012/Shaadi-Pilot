import { describe, it, expect, vi } from 'vitest';
import { guestInput, guestPatch, guestQuery } from '@/modules/guests/contracts';
import {
  readGuestDraft,
  guestDraftChanged,
} from '@/components/workspace/guest-draft';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Guests } from '@/components/workspace/guests';
import {
  guestResponseData,
  GuestRequestError,
  guestCreateAfterFailure,
} from '@/components/workspace/guest-request';
import { prepareCreate } from '@/lib/api/create-attempt';
import { loadedGuestPage } from '@/components/workspace/guest-list';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
describe('Guest contact contracts', () => {
  it('allows correcting a rejected create but preserves keys across uncertain outcomes', async () => {
    const attempt = prepareCreate(null, {
      selectedEventIds: ['removed-function'],
    });
    let rejection: unknown;
    try {
      await guestResponseData(
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'NOT_FOUND',
                message: 'Review the selected function.',
              },
            },
            { status: 404 },
          ),
        ),
        'save',
      );
    } catch (error) {
      rejection = error;
    }
    const rejected = guestCreateAfterFailure(attempt, rejection, false, true);
    expect(rejected).toEqual({ attempt: null, uncertain: false });
    const corrected = prepareCreate(rejected.attempt, { selectedEventIds: [] });
    expect(corrected.key).not.toBe(attempt.key);
    const lost = guestCreateAfterFailure(
      attempt,
      new TypeError('Failed to fetch'),
      false,
      true,
    );
    expect(lost).toEqual({ attempt, uncertain: true });
    expect(prepareCreate(lost.attempt, attempt.body).key).toBe(attempt.key);
    expect(() => prepareCreate(lost.attempt, { selectedEventIds: [] })).toThrow(
      /previous save/,
    );
    expect(
      guestCreateAfterFailure(lost.attempt, rejection, lost.uncertain, true),
    ).toEqual(lost);
    for (const error of [
      new Error('Unreadable response'),
      new GuestRequestError('Server failure', 500, 'INTERNAL_ERROR'),
      new GuestRequestError('Key conflict', 409, 'IDEMPOTENCY_CONFLICT'),
      new GuestRequestError('Removed original', 409, 'GUEST_ARCHIVED'),
    ])
      expect(guestCreateAfterFailure(attempt, error, false, true)).toEqual(
        lost,
      );
    expect(
      guestCreateAfterFailure(
        attempt,
        new Error('Session unavailable'),
        false,
        false,
      ).attempt,
    ).toBe(null);
  });
  it('keeps applied filters, multiple pages and cursor intact when a replacement load fails', async () => {
    const guest = {
      ...guestInput.parse({
        displayName: 'Guest',
        email: 'guest@example.test',
      }),
      id: '670000000000000000000001',
      version: 0,
      duplicateEmail: false,
      selectedEvents: [],
    };
    const first = {
      guests: [guest],
      summary: { total: 3, withFunctions: 0 },
      nextCursor: 'page-two',
      query: 'search=old',
    };
    let listing = loadedGuestPage(
      first,
      {
        ...first,
        guests: [{ ...guest, id: '670000000000000000000002' }],
        nextCursor: 'page-three',
      },
      first.query,
      true,
    );
    const before = listing;
    try {
      const data = await guestResponseData(
        Promise.reject(new TypeError('offline')),
      );
      listing = loadedGuestPage(listing, data, 'search=new', false);
    } catch {
      /* The displayed listing remains the last successful response. */
    }
    expect(listing).toBe(before);
    expect(listing.guests).toHaveLength(2);
    expect(listing.query).toBe('search=old');
    expect(listing.nextCursor).toBe('page-three');
    expect(() => loadedGuestPage(listing, first, 'search=new', true)).toThrow(
      /Refresh/,
    );
    const replaced = loadedGuestPage(
      listing,
      { guests: [], summary: first.summary, nextCursor: null },
      'search=new',
      false,
    );
    expect(replaced.query).toBe('search=new');
    expect(replaced.guests).toEqual([]);
    expect(replaced.nextCursor).toBe(null);
    expect(
      loadedGuestPage(
        listing,
        { guests: [guest], summary: first.summary, nextCursor: null },
        '',
        false,
      ).query,
    ).toBe('');
  });
  it('explains connection failures and uncertain responses without replacing API conflict guidance', async () => {
    await expect(
      guestResponseData(
        Promise.reject(new TypeError('Failed to fetch')),
        'save',
      ),
    ).rejects.toThrow(
      /Check your internet connection.*Save guest again.*draft is still here/,
    );
    await expect(
      guestResponseData(
        Promise.resolve(new Response('broken response')),
        'save',
      ),
    ).rejects.toThrow(/same details.*safely/);
    await expect(
      guestResponseData(
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { message: 'Review the latest guest details.' },
            }),
            { status: 412 },
          ),
        ),
        'save',
      ),
    ).rejects.toThrow('Review the latest guest details.');
    expect(
      await guestResponseData(
        Promise.resolve(Response.json({ data: { saved: true } })),
        'save',
      ),
    ).toEqual({ saved: true });
  });
  it('only asks to discard actual raw field or function changes, including invalid drafts', () => {
    const fields = new FormData();
    for (const key of ['displayName', 'email', 'phone', 'notes'])
      fields.set(key, '');
    expect(guestDraftChanged(fields, null)).toBe(false);
    fields.set('email', 'invalid');
    expect(guestDraftChanged(fields, null)).toBe(true);
    fields.set('email', '');
    expect(guestDraftChanged(fields, null)).toBe(false);
    fields.set('notes', ' ');
    expect(guestDraftChanged(fields, null)).toBe(true);
    fields.set('notes', '');
    fields.append('selectedEventIds', '670000000000000000000001');
    expect(guestDraftChanged(fields, null)).toBe(true);
    fields.delete('selectedEventIds');
    expect(guestDraftChanged(fields, null)).toBe(false);
    const original = guestInput.parse({
      displayName: 'Guest',
      email: 'guest@example.test',
      selectedEventIds: [
        '670000000000000000000001',
        '670000000000000000000002',
      ],
    });
    fields.set('displayName', original.displayName);
    fields.set('email', original.email);
    for (const id of [...original.selectedEventIds].reverse())
      fields.append('selectedEventIds', id);
    expect(guestDraftChanged(fields, original)).toBe(false);
    fields.set('displayName', 'Changed');
    expect(guestDraftChanged(fields, original)).toBe(true);
    expect(fields.get('displayName')).toBe('Changed');
  });
  it('renders private contact text safely and labels selection without claiming RSVP or sending', () => {
    const html = renderToStaticMarkup(
      createElement(Guests, {
        wedding: {
          id: '670000000000000000000001',
          displayNames: {
            partnerOne: 'Aarav',
            partnerTwo: 'Ananya',
            intro: '',
          },
          weddingDate: '2027-03-14',
          location: 'Jaipur',
          timezone: 'Asia/Kolkata',
          slug: 'test-wedding',
          isPublished: false,
          version: 0,
        },
        name: 'Organizer',
        role: 'manager',
        userId: '670000000000000000000002',
        initialList: {
          guests: [
            {
              id: '670000000000000000000003',
              version: 0,
              displayName: '<script>Guest</script>',
              email: 'family@example.test',
              phone: '',
              notes: '<img src=x onerror=alert(1)>',
              selectedEventIds: [],
              selectedEvents: [],
              duplicateEmail: true,
            },
          ],
          summary: { total: 1, withFunctions: 0 },
          nextCursor: null,
        },
        initialEvents: { events: [], nextCursor: null },
      }),
    );
    expect(html).not.toContain('<script>Guest</script>');
    expect(html).toContain('&lt;script&gt;Guest&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Shared email · separate contact');
    expect(html).toContain('Function selections are planning only.');
    expect(html).not.toContain('Confirmed attendance');
  });
  it('requires email and normalizes it without fabricating verification', () => {
    expect(
      guestInput.parse({
        displayName: ' Family contact ',
        email: ' FAMILY@example.test ',
      }),
    ).toEqual({
      displayName: 'Family contact',
      email: 'family@example.test',
      phone: '',
      notes: '',
      selectedEventIds: [],
    });
    for (const email of ['', null, 'invalid', 'a\r\nb@example.test'])
      expect(
        guestInput.safeParse({ displayName: 'Guest', email }).success,
      ).toBe(false);
  });
  it('rejects unknown fields, duplicate selections and malformed contact fields', () => {
    const base = { displayName: 'Guest', email: 'guest@example.test' },
      id = '670000000000000000000001';
    expect(guestInput.safeParse({ ...base, verified: true }).success).toBe(
      false,
    );
    expect(
      guestInput.safeParse({ ...base, selectedEventIds: [id, id] }).success,
    ).toBe(false);
    expect(
      guestInput.safeParse({ ...base, phone: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(guestPatch.safeParse({}).success).toBe(false);
    expect(guestPatch.parse({ selectedEventIds: [] })).toEqual({
      selectedEventIds: [],
    });
  });
  it('captures all checked functions before disabling the form and keeps inputs on failure', () => {
    const fields = new FormData();
    fields.set('displayName', 'Guest');
    fields.set('email', 'guest@example.test');
    fields.set('phone', '');
    fields.set('notes', 'Internal');
    fields.append('selectedEventIds', '670000000000000000000002');
    fields.append('selectedEventIds', '670000000000000000000001');
    const draft = readGuestDraft(fields);
    expect(draft.selectedEventIds).toEqual([
      '670000000000000000000001',
      '670000000000000000000002',
    ]);
    fields.set('displayName', 'Changed');
    expect(draft.displayName).toBe('Guest');
    fields.set('email', 'bad');
    expect(() => readGuestDraft(fields)).toThrow();
    expect(fields.get('notes')).toBe('Internal');
  });
  it('validates bounded search and paging filters', () => {
    expect(guestQuery.parse({ search: '  [Family]  ' })).toMatchObject({
      search: '[Family]',
      limit: 25,
    });
    expect(guestQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(guestQuery.safeParse({ unknown: 'x' }).success).toBe(false);
  });
});
