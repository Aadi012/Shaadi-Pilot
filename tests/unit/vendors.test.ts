import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  vendorInput,
  vendorPatch,
  vendorQuery,
} from '@/modules/vendors/contracts';
import {
  vendorResponseData,
  vendorRequest,
  VENDOR_REQUEST_TIMEOUT_MS,
} from '@/components/workspace/vendor-request';
import {
  guestCreateAfterFailure,
  GuestRequestError,
} from '@/components/workspace/guest-request';
import { prepareCreate } from '@/lib/api/create-attempt';
import { Vendors } from '@/components/workspace/vendors';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Manual vendor contracts and recovery', () => {
  it('bounds stalled removals and aborts the transport without claiming cancellation', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);
    const result = vendorRequest(
      '/api/v1/vendors/test',
      { method: 'DELETE' },
      'remove',
    );
    const assertion = expect(result).rejects.toThrow(
      'It may already have completed. Refresh the directory',
    );
    await vi.advanceTimersByTimeAsync(VENDOR_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal
        ?.aborted,
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a stalled response body and retains an uncertain create receipt', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }),
    );
    const attempt = prepareCreate(
      null,
      vendorInput.parse({ name: 'Studio', category: 'Photo' }),
    );
    const result = vendorRequest(
      '/api/v1/vendors',
      { method: 'POST' },
      'save',
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(VENDOR_REQUEST_TIMEOUT_MS);
    const error = await result;
    expect(error.message).toContain('Retry the same details');
    expect(guestCreateAfterFailure(attempt, error, false, true).attempt).toBe(
      attempt,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the deadline after a confirmed response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { removed: true } })),
    );
    expect(
      await vendorRequest(
        '/api/v1/vendors/test',
        { method: 'DELETE' },
        'remove',
      ),
    ).toEqual({ removed: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts optional contacts but rejects unsafe websites and server-owned fields', () => {
    const input = { name: ' Studio ', category: ' Photography ' };
    expect(vendorInput.parse(input)).toMatchObject({
      name: 'Studio',
      category: 'Photography',
      phone: '',
      notes: '',
    });
    expect(
      vendorInput.parse({ ...input, email: 'STUDIO@EXAMPLE.TEST' }).email,
    ).toBe('studio@example.test');
    for (const website of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'ftp://example.test',
      'https://user:password@example.test',
      'example.test',
    ])
      expect(vendorInput.safeParse({ ...input, website }).success).toBe(false);
    for (const extra of [
      { weddingId: 'foreign' },
      { source: 'google' },
      { googlePlaceId: 'x' },
      { status: 'booked' },
      { eventIds: [] },
      { name: '' },
      { phone: 'call me' },
      { email: 'invalid' },
    ])
      expect(vendorInput.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(vendorPatch.safeParse({}).success).toBe(false);
    expect(vendorQuery.safeParse({ search: 'a'.repeat(161) }).success).toBe(
      false,
    );
  });
  it('keeps an ambiguous create key but permits correction after definitive rejection', async () => {
    const attempt = prepareCreate(
      null,
      vendorInput.parse({ name: 'Studio', category: 'Photo' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    let error;
    try {
      await vendorResponseData(fetch('/unused'), 'save');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Your draft is kept');
    expect((error as Error).message).not.toContain('guest');
    expect(guestCreateAfterFailure(attempt, error, false, true).attempt).toBe(
      attempt,
    );
    const rejected = new GuestRequestError(
      'Invalid website',
      422,
      'VALIDATION_ERROR',
    );
    expect(
      guestCreateAfterFailure(attempt, rejected, false, true).attempt,
    ).toBeNull();
    expect(guestCreateAfterFailure(attempt, rejected, true, true).attempt).toBe(
      attempt,
    );
  });
  it('renders real vendor data safely, the active page header and mobile-ready fields', () => {
    const wedding = {
      id: 'wedding',
      displayNames: { partnerOne: 'A', partnerTwo: 'B', intro: '' },
      weddingDate: '2027-03-14',
      location: 'Jaipur',
      timezone: 'Asia/Kolkata',
      slug: 'a-b',
      isPublished: false,
      version: 0,
    };
    const vendor = {
      ...vendorInput.parse({
        name: '<script>Studio</script>',
        category: 'Photo',
        website: 'https://example.test',
        email: 'vendor@example.test',
        notes: 'Private note',
      }),
      id: 'vendor',
      version: 0,
      source: 'manual' as const,
    };
    const html = renderToStaticMarkup(
      createElement(Vendors, {
        wedding,
        name: 'Organizer',
        role: 'manager',
        userId: 'organizer',
        initial: {
          weddingId: 'wedding',
          vendors: [vendor],
          total: 1,
          nextCursor: null,
        },
      }),
    );
    expect(html).toContain('<small>Vendors</small>');
    expect(html).not.toContain('Workspace overview');
    expect(html).toContain('&lt;script&gt;Studio&lt;/script&gt;');
    expect(html).not.toContain('<script>Studio');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('mailto:vendor@example.test');
    expect(html).toContain('Manual record');
    expect(html).toContain('Team notes');
    expect(html).toContain('saved vendor · current filters');
    expect(html).not.toContain('saved vendors · current filters');
    expect(html).not.toContain('Directory Verified');
  });
});
