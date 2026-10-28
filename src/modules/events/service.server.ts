import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { loadOrganizerMembership } from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { objectIdSchema } from '@/modules/memberships/contracts';
import { eventInput, type EventDto } from './contracts';
import * as repository from './repository.server';
import { inviteKeySchema } from '@/modules/memberships/contracts';
import { hashSecret } from '@/modules/auth/security.server';
import { findRequest, recordRequest } from './requests.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
export { findPlanningEvents as planningEvents } from './repository.server';
async function context(userId: string, session?: ClientSession) {
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access is unavailable.');
  if (!(await activeWeddingForMembership(user.weddingId, session)))
    throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return user.weddingId;
}
function dto(
  row: NonNullable<Awaited<ReturnType<typeof repository.find>>>,
): EventDto {
  return {
    id: row._id.toString(),
    title: row.title,
    description: row.description ?? '',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    venue: row.venue,
    version: row.__v,
  };
}
export async function listEvents(userId: string, cursor?: string) {
  const weddingId = await context(userId);
  let after;
  if (cursor) {
    const parts = cursor.split('|');
    if (
      parts.length !== 2 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parts[0]) ||
      !Number.isFinite(Date.parse(parts[0]))
    )
      throw fail(400, 'INVALID_QUERY', 'Invalid page cursor.');
    after = {
      startsAt: new Date(parts[0]),
      id: new Types.ObjectId(objectIdSchema.parse(parts[1])),
    };
  }
  const rows = await repository.list(weddingId, after);
  const last = rows[99];
  return {
    weddingId: weddingId.toString(),
    events: rows.slice(0, 100).map(dto),
    hasMore: rows.length > 100,
    nextCursor:
      rows.length > 100
        ? last.startsAt.toISOString() + '|' + last._id.toString()
        : null,
  };
}
export async function readEvent(userId: string, id: string) {
  const weddingId = await context(userId);
  const row = await repository.find(
    weddingId,
    new Types.ObjectId(objectIdSchema.parse(id)),
  );
  if (!row) throw fail(404, 'NOT_FOUND', 'Function not found.');
  return dto(row);
}
export async function writeEvent(
  userId: string,
  expectedWedding: string,
  input: unknown,
  id?: string,
  version?: number,
  archive = false,
  key?: string,
) {
  const data = archive ? undefined : eventInput.parse(input);
  objectIdSchema.parse(expectedWedding);
  const objectId = id
    ? new Types.ObjectId(objectIdSchema.parse(id))
    : undefined;
  const db = await repository.database();
  const requestId = !id
    ? hashSecret(`${userId}:${expectedWedding}:${inviteKeySchema.parse(key)}`)
    : undefined;
  const requestHash = requestId ? hashSecret(JSON.stringify(data)) : '';
  return db.connection.transaction(async (session) => {
    const weddingId = await context(userId, session);
    if (weddingId.toString() !== expectedWedding)
      throw fail(
        409,
        'WEDDING_CONTEXT_CHANGED',
        'Your wedding changed. Reload before continuing.',
      );
    if (!(await lockWeddingMembership(weddingId, session)))
      throw fail(404, 'NOT_FOUND', 'Wedding not found.');
    if (!objectId) {
      const receipt = await findRequest(requestId!, weddingId, session);
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key was used for different details.',
          );
        const existing = await repository.find(
          weddingId,
          receipt.eventId,
          session,
        );
        if (!existing)
          throw fail(
            409,
            'FUNCTION_ARCHIVED',
            'This request already created a function which was later removed. Refresh the schedule.',
          );
        return dto(existing);
      }
      const result = dto(await repository.insert(weddingId, data!, session));
      await recordRequest(
        {
          _id: requestId!,
          weddingId,
          requestHash,
          eventId: new Types.ObjectId(result.id),
        },
        session,
      );
      return result;
    }
    const current = await repository.find(weddingId, objectId, session);
    if (!current) throw fail(404, 'NOT_FOUND', 'Function not found.');
    if (current.__v !== version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'Function changed. Your draft is preserved. Reload to review the latest details.',
      );
    if (
      archive &&
      (await repository.hasReferences(weddingId, objectId, session))
    )
      throw fail(
        409,
        'FUNCTION_HAS_LINKS',
        'This function has linked records and cannot be removed.',
      );
    const row = await repository.update(
      weddingId,
      objectId,
      version!,
      data,
      session,
    );
    if (!row)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'Function changed. Refresh and review.',
      );
    return dto(row);
  });
}
