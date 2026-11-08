import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('server-only', () => ({}));
import { googlePlaces, placesSetup } from '@/modules/vendors/places.server';
import {
  discoveryInput,
  savePlaceInput,
} from '@/modules/vendors/discovery-contracts';
import { GoogleListing } from '@/components/workspace/google-listing';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function configured() {
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'private-test-key');
  vi.stubEnv('GOOGLE_MAPS_TERMS_URL', 'https://example.test/terms');
  vi.stubEnv('GOOGLE_MAPS_PRIVACY_URL', 'https://example.test/privacy');
}
const listing = {
  id: 'Place_test',
  displayName: { text: 'Studio <A>' },
  formattedAddress: 'Jaipur',
  rating: 4.5,
  userRatingCount: 12,
  websiteUri: 'javascript:alert(1)',
  googleMapsUri: 'https://evil.test/map',
  attributions: [
    {
      provider: 'Source partner',
      providerUri: 'https://example.test/provider',
    },
  ],
};
describe('Google Places adapter and contracts', () => {
  it('keeps the app unconfigured without a key and public policy URLs; never calls Google', async () => {
    configured();
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(placesSetup().ready).toBe(false);
    await expect(
      googlePlaces.search('Photographer', 'Jaipur'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
    configured();
    vi.stubEnv('GOOGLE_MAPS_TERMS_URL', 'http://localhost:3000/terms');
    expect(placesSetup().ready).toBe(false);
  });
  it('uses a bounded no-store request with a field mask and sanitized links/attribution', async () => {
    configured();
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ places: [listing] }));
    vi.stubGlobal('fetch', fetch);
    const result = await googlePlaces.search('Photographer', 'Jaipur, India');
    expect(result[0]).toMatchObject({
      id: 'Place_test',
      website: '',
      rating: 4.5,
      ratingCount: 12,
      attributions: [
        { name: 'Source partner', url: 'https://example.test/provider' },
      ],
    });
    expect(result[0].mapsUrl).toContain('https://www.google.com/maps/search/');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
    expect(options.headers['X-Goog-FieldMask']).not.toContain('*');
    expect(JSON.parse(options.body)).toEqual({
      textQuery: 'Photographer near Jaipur, India',
      pageSize: 10,
      languageCode: 'en',
    });
    expect(JSON.stringify(result)).not.toContain('private-test-key');
    const html = renderToStaticMarkup(
      createElement(GoogleListing, { place: result[0] }),
    );
    expect(html).toContain('translate="no"');
    expect(html).toContain('Google Maps');
    expect(html).toContain('Source partner');
    expect(html).toContain('Studio &lt;A&gt;');
    expect(html).not.toContain('javascript:');
  });
  it('maps provider failures/timeouts to safe errors without leaking payloads', async () => {
    configured();
    for (const [response, status] of [
      [new Response('private provider error', { status: 403 }), 502],
      [new Response('private quota error', { status: 429 }), 429],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(
        googlePlaces.search('Photographer', 'Jaipur'),
      ).rejects.toMatchObject({ status });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private timeout')),
    );
    await expect(googlePlaces.details('Place_test')).rejects.toThrow(
      'temporarily unavailable',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ id: 'different' })),
    );
    await expect(googlePlaces.verify('Place_test')).rejects.toMatchObject({
      status: 502,
    });
  });
  it('requests details explicitly and keeps arbitrary provider fields out of DTOs', async () => {
    configured();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        ...listing,
        internationalPhoneNumber: '+91 90000 00000',
        rawSecret: 'do not expose',
      }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await googlePlaces.details('Place_test')).toMatchObject({
      phone: '+91 90000 00000',
    });
    expect(fetch.mock.calls[0][1].headers['X-Goog-FieldMask']).toContain(
      'internationalPhoneNumber',
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ places: [{ id: 'bad/place' }] })),
    );
    await expect(
      googlePlaces.search('Photographer', 'Jaipur'),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('validates explicit location sources and accepts only user labels/notes when saving a reference', () => {
    expect(
      discoveryInput.safeParse({
        category: 'Photographer',
        locationSource: 'wedding',
      }).success,
    ).toBe(true);
    for (const input of [
      { category: 'all', locationSource: 'wedding' },
      { category: 'DJ', locationSource: 'function' },
      { category: 'DJ', locationSource: 'wedding', eventId: 'a'.repeat(24) },
      { category: 'DJ', locationSource: 'custom', location: '' },
      { category: 'DJ', locationSource: 'wedding', lat: 1 },
    ])
      expect(discoveryInput.safeParse(input).success).toBe(false);
    const saved = {
      googlePlaceId: 'Place_test',
      name: 'Our photo shortlist',
      category: 'Photographer',
      notes: 'Ask family',
    };
    expect(savePlaceInput.parse(saved)).toEqual(saved);
    for (const extra of [
      { providerName: 'Google name' },
      { rating: 5 },
      { website: 'https://example.test' },
      { name: '' },
      { googlePlaceId: '../secret' },
    ])
      expect(savePlaceInput.safeParse({ ...saved, ...extra }).success).toBe(
        false,
      );
  });
});
