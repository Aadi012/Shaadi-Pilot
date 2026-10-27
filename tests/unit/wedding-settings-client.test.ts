import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveWeddingDetails } from '@/components/workspace/wedding-settings-client';

const saved = { id: 'wedding-a', version: 3 };
const draft = {
  displayNames: { partnerOne: 'Ananya', partnerTwo: 'Aarav', intro: 'Draft A' },
  weddingDate: '2027-03-14',
  location: 'Jaipur',
  timezone: 'Asia/Kolkata',
};
const organizer = {
  id: 'organizer',
  displayName: 'Organizer',
  email: 'organizer@example.test',
  role: 'admin',
};
afterEach(() => vi.unstubAllGlobals());

describe('wedding settings session refresh', () => {
  it('never PATCHes wedding B with wedding A’s draft, even when versions match', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          user: { ...organizer, weddingId: 'wedding-b' },
          csrfToken: 'csrf-for-b',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const original = structuredClone(draft);
    expect(await saveWeddingDetails(saved, draft)).toEqual({
      kind: 'wedding-changed',
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/session', {
      cache: 'no-store',
    });
    expect(draft).toEqual(original);
  });

  it('blocks a refreshed account with no wedding and a signed-out session', async () => {
    for (const user of [{ ...organizer, weddingId: null }, null]) {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { user, csrfToken: 'csrf' } }),
        );
      vi.stubGlobal('fetch', fetch);
      expect(await saveWeddingDetails(saved, draft)).toEqual({
        kind: user ? 'wedding-changed' : 'signed-out',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('saves the matching wedding with its original version and refreshed CSRF', async () => {
    const response = Response.json({
      data: { wedding: { ...saved, version: 4 } },
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            user: { ...organizer, weddingId: saved.id },
            csrfToken: 'fresh-csrf',
          },
        }),
      )
      .mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetch);
    expect(await saveWeddingDetails(saved, draft)).toEqual({
      kind: 'response',
      response,
    });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/weddings/current', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'fresh-csrf',
        'If-Match': '"3"',
      },
      body: JSON.stringify(draft),
    });
  });

  it('never sends a write when session refresh fails', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(saveWeddingDetails(saved, draft)).rejects.toThrow(
      'Session unavailable',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
