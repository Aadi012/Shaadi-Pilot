import 'server-only';
import { Types } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { hashSecret } from '@/modules/auth/security.server';
import {
  inviteKeySchema,
  objectIdSchema,
} from '@/modules/memberships/contracts';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { readEvent } from '@/modules/events/service.server';
import {
  discoveryInput,
  savePlaceInput,
  type DiscoveryResult,
} from './discovery-contracts';
import { googlePlaces, type PlacesProvider } from './places.server';
import { vendorContext, vendorDto } from './service.server';
import * as repo from './repository.server';

const unavailable = () =>
  new ApiError({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message:
      'Google discovery is not configured yet. Saved vendors remain available.',
  });
async function budget(
  userId: string,
  weddingId: string,
  provider: PlacesProvider,
) {
  if (!provider.ready()) throw unavailable();
  await enforceIdentityLimit('places:user:' + userId, 10);
  await enforceIdentityLimit('places:wedding:' + weddingId, 50);
  await enforceIdentityLimit('places:global', 500);
}
export async function discoverVendors(
  userId: string,
  expected: string,
  input: unknown,
  provider: PlacesProvider = googlePlaces,
): Promise<DiscoveryResult> {
  objectIdSchema.parse(expected);
  const query = discoveryInput.parse(input);
  await repo.database();
  const weddingId = await vendorContext(userId, expected);
  let location: string;
  if (query.locationSource === 'wedding') {
    const wedding = await activeWeddingForMembership(weddingId);
    if (!wedding)
      throw new ApiError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Wedding not found.',
      });
    location = wedding.defaultLocation.name;
  } else if (query.locationSource === 'function') {
    const event = await readEvent(userId, query.eventId!);
    location = [event.venue.name, event.venue.address]
      .filter(Boolean)
      .join(', ');
  } else location = query.location!;
  await vendorContext(userId, expected);
  await budget(userId, expected, provider);
  const places = await provider.search(query.category, location);
  await vendorContext(userId, expected);
  const saved = await repo.savedPlaces(
    weddingId,
    places.map((p) => p.id),
  );
  return {
    weddingId: expected,
    location,
    places: places.map((place) => ({
      ...place,
      savedVendorId:
        saved.find((v) => v.googlePlaceId === place.id)?._id.toString() ?? null,
    })),
  };
}
export async function savedPlaceDetails(
  userId: string,
  expected: string,
  id: string,
  provider: PlacesProvider = googlePlaces,
) {
  const weddingId = await vendorContext(userId, objectIdSchema.parse(expected));
  await repo.database();
  const row = await repo.find(
    weddingId,
    new Types.ObjectId(objectIdSchema.parse(id)),
  );
  if (!row?.googlePlaceId || row.source !== 'google')
    throw new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Saved Google reference not found.',
    });
  await budget(userId, expected, provider);
  const place = await provider.details(row.googlePlaceId);
  await vendorContext(userId, expected);
  if (!(await repo.find(weddingId, row._id)))
    throw new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Vendor removed. Refresh the directory.',
    });
  return { weddingId: expected, place };
}
export async function saveGoogleVendor(
  userId: string,
  expected: string,
  input: unknown,
  requestKey: unknown,
  provider: PlacesProvider = googlePlaces,
) {
  const parsed = savePlaceInput.parse(input);
  objectIdSchema.parse(expected);
  const key = hashSecret(
    userId +
      ':' +
      expected +
      ':google-vendor:' +
      inviteKeySchema.parse(requestKey),
  );
  const hash = hashSecret(JSON.stringify(parsed));
  const db = await repo.placeDatabase();
  const weddingId = await vendorContext(userId, expected);
  // A matching durable receipt can be replayed during a provider outage.
  if (
    !(await repo.receipt(key)) &&
    !(await repo.findPlace(weddingId, parsed.googlePlaceId))
  ) {
    await budget(userId, expected, provider);
    await provider.verify(parsed.googlePlaceId);
  }
  return db.connection.transaction(async (session) => {
    const wedding = await vendorContext(userId, expected, session);
    await lockWeddingMembership(wedding, session);
    const receipt = await repo.receipt(key, session);
    if (receipt) {
      if (receipt.hash !== hash)
        throw new ApiError({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'This key was used for different vendor details.',
        });
      const row = await repo.find(wedding, receipt.vendorId!, session);
      if (!row)
        throw new ApiError({
          status: 409,
          code: 'VENDOR_ARCHIVED',
          message:
            'The original saved reference was removed. Refresh before saving again.',
        });
      return {
        weddingId: expected,
        vendor: vendorDto(row),
        alreadySaved: false,
      };
    }
    const existing = await repo.findPlace(
      wedding,
      parsed.googlePlaceId,
      session,
    );
    let row = existing;
    if (!row) {
      const id = new Types.ObjectId();
      await repo.insert(
        {
          ...parsed,
          phone: '',
          email: '',
          website: '',
          address: '',
          source: 'google',
          _id: id,
          weddingId: wedding,
          archivedAt: null,
          createdBy: new Types.ObjectId(userId),
          updatedBy: new Types.ObjectId(userId),
          __v: 0,
        },
        session,
      );
      row = (await repo.find(wedding, id, session))!;
    }
    await repo.saveReceipt(
      { _id: key, weddingId: wedding, hash, vendorId: row._id },
      session,
    );
    return {
      weddingId: expected,
      vendor: vendorDto(row),
      alreadySaved: !!existing,
    };
  });
}
