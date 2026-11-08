import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import {
  objectIdSchema,
  inviteKeySchema,
} from '@/modules/memberships/contracts';
import { hashSecret } from '@/modules/auth/security.server';
import {
  vendorInput,
  vendorPatch,
  vendorQuery,
  type VendorDto,
} from './contracts';
import * as repo from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
const oid = (id: string) => new Types.ObjectId(objectIdSchema.parse(id));
export async function vendorContext(
  userId: string,
  expected?: string,
  session?: ClientSession,
) {
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access unavailable.');
  if (expected && user.weddingId.toString() !== expected)
    throw fail(
      409,
      'WEDDING_CONTEXT_CHANGED',
      'Your wedding changed. Reload before saving.',
    );
  if (!(await activeWeddingForMembership(user.weddingId, session)))
    throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return user.weddingId;
}
export function vendorDto(row: repo.VendorRecord): VendorDto {
  return {
    id: row._id.toString(),
    name: row.name,
    category: row.category,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    notes: row.notes,
    source: row.source ?? 'manual',
    googlePlaceId: row.googlePlaceId ?? null,
    version: row.__v,
  };
}
export async function listVendors(userId: string, input: unknown = {}) {
  await repo.database();
  const weddingId = await vendorContext(userId),
    query = vendorQuery.parse(input);
  const { cursor, ...filters } = query;
  const fingerprint = hashSecret(JSON.stringify({ weddingId, ...filters }));
  let before: Types.ObjectId | undefined;
  if (cursor) {
    const parts = cursor.split(':');
    if (parts.length !== 2 || parts[0] !== fingerprint)
      throw fail(400, 'INVALID_QUERY', 'Refresh vendors before loading more.');
    before = oid(parts[1]);
  }
  const rows = await repo.list(weddingId, query, before);
  return {
    weddingId: weddingId.toString(),
    vendors: rows.slice(0, 25).map(vendorDto),
    nextCursor: rows.length > 25 ? fingerprint + ':' + rows[24]._id : null,
    total: await repo.count(weddingId, query),
  };
}
export async function readVendor(userId: string, id: string) {
  await repo.database();
  const weddingId = await vendorContext(userId),
    row = await repo.find(weddingId, oid(id));
  if (!row) throw fail(404, 'NOT_FOUND', 'Vendor not found.');
  return { weddingId: weddingId.toString(), vendor: vendorDto(row) };
}
export const trustedVendorCount = (weddingId: string) =>
  repo.count(oid(weddingId), vendorQuery.parse({}));
export async function writeVendor(
  userId: string,
  expected: string,
  input: unknown,
  options: {
    id?: string;
    version?: number;
    archive?: boolean;
    key?: string;
  } = {},
) {
  const data = options.archive
    ? undefined
    : options.id
      ? vendorPatch.parse(input)
      : vendorInput.parse(input);
  objectIdSchema.parse(expected);
  const key = !options.id
    ? hashSecret(
        userId +
          ':' +
          expected +
          ':vendor:' +
          inviteKeySchema.parse(options.key),
      )
    : undefined;
  const hash = hashSecret(JSON.stringify(data ?? null));
  const db = await repo.database();
  return db.connection.transaction(async (session) => {
    const weddingId = await vendorContext(userId, expected, session);
    await lockWeddingMembership(weddingId, session);
    if (key) {
      const receipt = await repo.receipt(key, session);
      if (receipt) {
        if (receipt.hash !== hash)
          throw fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key was used for different vendor details.',
          );
        const row = await repo.find(weddingId, receipt.vendorId!, session);
        if (!row)
          throw fail(
            409,
            'VENDOR_ARCHIVED',
            'The original vendor was removed. Refresh before starting another.',
          );
        return { weddingId: expected, vendor: vendorDto(row) };
      }
    }
    let row = options.id
      ? await repo.find(weddingId, oid(options.id), session)
      : null;
    if (options.id && !row) throw fail(404, 'NOT_FOUND', 'Vendor not found.');
    if (row && row.__v !== options.version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This vendor changed. Your draft is kept. Load and review the latest details.',
      );
    if (!row) {
      const parsed = vendorInput.parse(data);
      const id = new Types.ObjectId();
      await repo.insert(
        {
          ...parsed,
          source: 'manual',
          _id: id,
          weddingId,
          archivedAt: null,
          createdBy: oid(userId),
          updatedBy: oid(userId),
          __v: 0,
        },
        session,
      );
      await repo.saveReceipt(
        { _id: key!, weddingId, hash, vendorId: id },
        session,
      );
      row = (await repo.find(weddingId, id, session))!;
    } else {
      row = await repo.update(
        weddingId,
        row._id,
        options.version!,
        {
          ...(data ?? {}),
          ...(options.archive ? { archivedAt: new Date() } : {}),
          updatedBy: oid(userId),
        },
        session,
      );
      if (!row)
        throw fail(
          412,
          'PRECONDITION_FAILED',
          'Vendor changed. Refresh before saving.',
        );
    }
    return { weddingId: expected, vendor: vendorDto(row) };
  });
}
