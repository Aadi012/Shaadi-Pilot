import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { placeIdSchema, type GooglePlace } from './discovery-contracts';

const publicUrl = (value: string | undefined) => {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password
    ? url.toString()
    : null;
};
export function placesSetup() {
  const termsUrl = publicUrl(process.env.GOOGLE_MAPS_TERMS_URL);
  const privacyUrl = publicUrl(process.env.GOOGLE_MAPS_PRIVACY_URL);
  return {
    ready:
      !!process.env.GOOGLE_PLACES_API_KEY?.trim() && !!termsUrl && !!privacyUrl,
    termsUrl,
    privacyUrl,
  };
}
const safeLink = (value: string | undefined) => {
  if (!value || !URL.canParse(value)) return '';
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) &&
    !url.username &&
    !url.password
    ? url.toString()
    : '';
};
const place = z.object({
  id: placeIdSchema,
  displayName: z.object({ text: z.string().max(1000) }).optional(),
  formattedAddress: z.string().max(2000).optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().safe().optional(),
  internationalPhoneNumber: z.string().max(80).optional(),
  nationalPhoneNumber: z.string().max(80).optional(),
  websiteUri: z.string().max(4096).optional(),
  googleMapsUri: z.string().max(4096).optional(),
  attributions: z
    .array(
      z.object({
        provider: z.string().max(500).optional(),
        providerUri: z.string().max(4096).optional(),
      }),
    )
    .max(100)
    .optional(),
});
const normalize = (value: unknown): GooglePlace => {
  const data = place.parse(value);
  const mapsUrl = safeLink(data.googleMapsUri);
  return {
    id: data.id,
    name: data.displayName?.text ?? 'Google listing',
    address: data.formattedAddress ?? '',
    rating: data.rating ?? null,
    ratingCount: data.userRatingCount ?? null,
    phone: data.internationalPhoneNumber ?? data.nationalPhoneNumber ?? '',
    website: safeLink(data.websiteUri),
    mapsUrl:
      mapsUrl &&
      [
        'www.google.com',
        'maps.google.com',
        'maps.google.co.in',
        'google.com',
      ].includes(new URL(mapsUrl).hostname)
        ? mapsUrl
        : 'https://www.google.com/maps/search/?api=1&query=Place&query_place_id=' +
          encodeURIComponent(data.id),
    attributions: (data.attributions ?? []).map((a) => ({
      name: a.provider ?? 'Data provider',
      url: safeLink(a.providerUri),
    })),
  };
};
const fields =
  'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,attributions';
const unavailable = () =>
  new ApiError({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message:
      'Google vendor discovery is not configured yet. You can still manage saved vendors.',
  });
export interface PlacesProvider {
  ready(): boolean;
  search(category: string, location: string): Promise<GooglePlace[]>;
  details(id: string): Promise<GooglePlace>;
  verify(id: string): Promise<void>;
}
async function request(path: string, mask: string, body?: unknown) {
  if (!placesSetup().ready) throw unavailable();
  try {
    const response = await fetch('https://places.googleapis.com/v1/' + path, {
      method: body ? 'POST' : 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': mask,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 429)
      throw new ApiError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Google discovery is busy. Please wait before retrying.',
      });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      status: 502,
      code: 'PROVIDER_FAILURE',
      message:
        'Google listings are temporarily unavailable. Retry shortly; your saved vendors are available.',
    });
  }
}
export const googlePlaces: PlacesProvider = {
  ready: () => placesSetup().ready,
  async search(category, location) {
    const data = await request(
      'places:searchText',
      fields
        .split(',')
        .map((f) => 'places.' + f)
        .join(','),
      {
        textQuery: category + ' near ' + location,
        pageSize: 10,
        languageCode: 'en',
      },
    );
    try {
      return (
        z
          .object({ places: z.array(z.unknown()).max(10).optional() })
          .parse(data)
          .places?.map(normalize) ?? []
      );
    } catch {
      throw new ApiError({
        status: 502,
        code: 'PROVIDER_FAILURE',
        message: 'Google returned an unreadable listing. Please retry shortly.',
      });
    }
  },
  async details(id) {
    const data = await request(
      'places/' + encodeURIComponent(placeIdSchema.parse(id)),
      fields + ',internationalPhoneNumber,nationalPhoneNumber,websiteUri',
    );
    try {
      const result = normalize(data);
      if (result.id !== id) throw new Error();
      return result;
    } catch {
      throw new ApiError({
        status: 502,
        code: 'PROVIDER_FAILURE',
        message: 'Google returned an unreadable listing. Please retry shortly.',
      });
    }
  },
  async verify(id) {
    const data = await request(
      'places/' + encodeURIComponent(placeIdSchema.parse(id)),
      'id',
    );
    if (data?.id !== id)
      throw new ApiError({
        status: 502,
        code: 'PROVIDER_FAILURE',
        message: 'This Google listing could not be verified. Search again.',
      });
  },
};
