import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { hashSecret } from '@/modules/auth/security.server';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { planningEvents } from '@/modules/events/service.server';
import {
  inviteKeySchema,
  objectIdSchema,
} from '@/modules/memberships/contracts';
import { guestInput, guestPatch, guestQuery, type GuestDto } from './contracts';
import * as repository from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
async function context(userId: string, session?: ClientSession) {
  await repository.database();
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access is unavailable.');
  if (!(await activeWeddingForMembership(user.weddingId, session)))
    throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return user.weddingId;
}
async function dtos(
  weddingId: Types.ObjectId,
  rows: repository.GuestRecord[],
  session?: ClientSession,
): Promise<GuestDto[]> {
  const events = await planningEvents(
    weddingId,
    rows.flatMap((r) => r.selectedEventIds ?? []),
    session,
  );
  const duplicates = await repository.duplicateEmails(
    weddingId,
    rows.map((r) => r.emailNormalized),
    session,
  );
  return rows.map((row) => ({
    id: row._id.toString(),
    version: row.__v,
    displayName: row.displayName,
    email: row.emailNormalized,
    phone: row.phone ?? '',
    notes: row.notes ?? '',
    selectedEventIds: (row.selectedEventIds ?? []).map((id) => id.toString()),
    selectedEvents: events
      .filter((e) =>
        (row.selectedEventIds ?? []).some((id) => id.equals(e._id)),
      )
      .map((e) => ({ id: e._id.toString(), title: e.title })),
    duplicateEmail: duplicates.some((d) => d._id === row.emailNormalized),
  }));
}
export async function listGuests(userId: string, input: unknown) {
  const weddingId = await context(userId),
    query = guestQuery.parse(input);
  const { cursor, ...filters } = query;
  const hash = hashSecret(
    JSON.stringify({ weddingId: weddingId.toString(), ...filters }),
  );
  let before;
  if (cursor) {
    try {
      const d = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (d.hash !== hash) throw new Error();
      before = new Types.ObjectId(objectIdSchema.parse(d.id));
    } catch {
      throw fail(400, 'INVALID_QUERY', 'Invalid guest page cursor.');
    }
  }
  const rows = await repository.list(weddingId, query, before),
    hasMore = rows.length > query.limit;
  return {
    weddingId: weddingId.toString(),
    guests: await dtos(weddingId, rows.slice(0, query.limit)),
    summary: await repository.summary(weddingId),
    nextCursor: hasMore
      ? Buffer.from(
          JSON.stringify({ id: rows[query.limit - 1]._id.toString(), hash }),
        ).toString('base64url')
      : null,
  };
}
export async function readGuest(userId: string, id: string) {
  const weddingId = await context(userId),
    row = await repository.find(
      weddingId,
      new Types.ObjectId(objectIdSchema.parse(id)),
    );
  if (!row) throw fail(404, 'NOT_FOUND', 'Guest contact not found.');
  return {
    weddingId: weddingId.toString(),
    guest: (await dtos(weddingId, [row]))[0],
  };
}
export async function writeGuest(
  userId: string,
  expectedWedding: string,
  input: unknown,
  options: {
    id?: string;
    version?: number;
    archive?: boolean;
    key?: string;
  } = {},
) {
  objectIdSchema.parse(expectedWedding);
  const id = options.id
    ? new Types.ObjectId(objectIdSchema.parse(options.id))
    : undefined;
  const parsed = options.archive
    ? undefined
    : id
      ? guestPatch.parse(input)
      : guestInput.parse(input);
  const requestId = id
      ? undefined
      : hashSecret(
          `${userId}:${expectedWedding}:${inviteKeySchema.parse(options.key)}`,
        ),
    requestHash = requestId ? hashSecret(JSON.stringify(parsed)) : '';
  const db = await repository.database();
  return db.connection.transaction(async (session) => {
    const weddingId = await context(userId, session);
    if (weddingId.toString() !== expectedWedding)
      throw fail(
        409,
        'WEDDING_CONTEXT_CHANGED',
        'Your wedding changed. Reload before saving.',
      );
    if (!(await lockWeddingMembership(weddingId, session)))
      throw fail(404, 'NOT_FOUND', 'Wedding not found.');
    if (requestId) {
      const receipt = await repository.findRequest(
        requestId,
        weddingId,
        session,
      );
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key was used for different details.',
          );
        const row = await repository.find(weddingId, receipt.guestId, session);
        if (!row)
          throw fail(
            409,
            'GUEST_ARCHIVED',
            'This request already created a removed guest. Refresh the directory.',
          );
        return (await dtos(weddingId, [row], session))[0];
      }
    }
    const current = id ? await repository.find(weddingId, id, session) : null;
    if (id && !current)
      throw fail(404, 'NOT_FOUND', 'Guest contact not found.');
    if (current && current.__v !== options.version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This guest changed. Your draft is kept; review the latest details.',
      );
    const actor = new Types.ObjectId(userId);
    if (options.archive) {
      if (await repository.hasAccessReferences(weddingId, id!, session))
        throw fail(
          409,
          'GUEST_HAS_ACCESS',
          'This guest has private-access records. Removal requires the invitation revocation workflow.',
        );
      const row = await repository.update(
        weddingId,
        id!,
        options.version!,
        { archivedAt: new Date(), updatedBy: actor },
        session,
      );
      if (!row)
        throw fail(
          412,
          'PRECONDITION_FAILED',
          'Guest changed. Reload and review.',
        );
      return (await dtos(weddingId, [row], session))[0];
    }
    const data = guestInput.parse({
      ...(current
        ? {
            displayName: current.displayName,
            email: current.emailNormalized,
            phone: current.phone,
            notes: current.notes,
            selectedEventIds: (current.selectedEventIds ?? []).map((id) =>
              id.toString(),
            ),
          }
        : {}),
      ...parsed,
    });
    if (
      current &&
      (data.email !== current.emailNormalized ||
        JSON.stringify(data.selectedEventIds) !==
          JSON.stringify(
            (current.selectedEventIds ?? []).map((id) => id.toString()).sort(),
          )) &&
      (await repository.hasAccessReferences(weddingId, current._id, session))
    )
      throw fail(
        409,
        'GUEST_HAS_ACCESS',
        'Private invitation records exist. Email or function changes require their revocation workflow.',
      );
    const selectedEventIds = data.selectedEventIds.map(
      (id) => new Types.ObjectId(id),
    );
    if (
      (await planningEvents(weddingId, selectedEventIds, session)).length !==
      selectedEventIds.length
    )
      throw fail(
        404,
        'NOT_FOUND',
        'A selected function is unavailable. Review the selection.',
      );
    const record = {
      displayName: data.displayName,
      emailNormalized: data.email,
      phone: data.phone,
      notes: data.notes,
      selectedEventIds,
      updatedBy: actor,
    };
    const row = current
      ? await repository.update(
          weddingId,
          id!,
          options.version!,
          record,
          session,
        )
      : await repository.insert(
          { ...record, weddingId, createdBy: actor, archivedAt: null },
          session,
        );
    if (!row)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'Guest changed. Reload and review.',
      );
    if (requestId)
      await repository.recordRequest(
        { _id: requestId, weddingId, requestHash, guestId: row._id },
        session,
      );
    return (await dtos(weddingId, [row], session))[0];
  });
}
