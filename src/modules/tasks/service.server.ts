import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { ApiError } from '@/lib/api/errors';
import { hashSecret } from '@/modules/auth/security.server';
import {
  loadOrganizerMembership,
  weddingOrganizer,
  planningOrganizers,
  weddingOrganizers,
} from '@/modules/auth/service.server';
import {
  activeWeddingForMembership,
  lockWeddingMembership,
} from '@/modules/weddings/service.server';
import { planningEvents } from '@/modules/events/service.server';
import {
  inviteKeySchema,
  objectIdSchema,
} from '@/modules/memberships/contracts';
import {
  taskInput,
  taskPatch,
  taskQuery,
  isOverdue,
  type TaskDto,
  type TaskInput,
} from './contracts';
import * as repository from './repository.server';
const fail = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });
async function context(userId: string, session?: ClientSession) {
  await repository.database();
  const user = await loadOrganizerMembership(userId, session);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Please log in.');
  if (!user.weddingId || !['admin', 'manager'].includes(user.role ?? ''))
    throw fail(403, 'FORBIDDEN', 'Wedding access is unavailable.');
  const wedding = await activeWeddingForMembership(user.weddingId, session);
  if (!wedding) throw fail(404, 'NOT_FOUND', 'Wedding not found.');
  return { user, weddingId: user.weddingId, timezone: wedding.timezone };
}
async function dtos(
  weddingId: Types.ObjectId,
  rows: repository.TaskRecord[],
  now: Date,
  session?: ClientSession,
): Promise<TaskDto[]> {
  const members = await planningOrganizers(
    weddingId,
    rows.flatMap((r) => (r.assignedToUserId ? [r.assignedToUserId] : [])),
    session,
  );
  const events = await planningEvents(
    weddingId,
    rows.flatMap((r) => (r.eventId ? [r.eventId] : [])),
    session,
  );
  return rows.map((row) => {
    const member = members.find(
      (m) =>
        m._id.equals(row.assignedToUserId) &&
        (m.membershipVersion ?? 0) === (row.assignedMembershipVersion ?? 0),
    );
    const event = events.find((e) => e._id.equals(row.eventId));
    const data: TaskInput = {
      title: row.title,
      description: row.description ?? '',
      status: row.status,
      eventId: row.eventId?.toString() ?? null,
      assignedToUserId: row.assignedToUserId?.toString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
    };
    return {
      ...data,
      id: row._id.toString(),
      version: row.__v,
      assignee: {
        state: !row.assignedToUserId
          ? 'unassigned'
          : member
            ? 'active'
            : 'former',
        name: member?.displayName ?? null,
      },
      event: event ? { id: event._id.toString(), title: event.title } : null,
      overdue: isOverdue(data, now.getTime()),
    };
  });
}
export async function listTasks(userId: string, input: unknown) {
  const { weddingId, timezone, user } = await context(userId);
  const query = taskQuery.parse(input);
  const { cursor, ...filters } = query;
  const hash = hashSecret(JSON.stringify(filters));
  let before;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (decoded.hash !== hash) throw new Error();
      before = new Types.ObjectId(objectIdSchema.parse(decoded.id));
    } catch {
      throw fail(400, 'INVALID_QUERY', 'Invalid page cursor.');
    }
  }
  const now = new Date();
  const rows = await repository.list(weddingId, query, before, now);
  const hasMore = rows.length > query.limit;
  return {
    weddingId: weddingId.toString(),
    timezone,
    tasks: await dtos(weddingId, rows.slice(0, query.limit), now),
    summary: await repository.summary(
      weddingId,
      userId,
      now,
      user.membershipVersion ?? 0,
    ),
    nextCursor: hasMore
      ? Buffer.from(
          JSON.stringify({ id: rows[query.limit - 1]._id.toString(), hash }),
        ).toString('base64url')
      : null,
  };
}
// Dashboard supplies a wedding ID already resolved from current authenticated membership.
export async function taskOverview(weddingId: string, userId: string) {
  const current = await context(userId);
  if (current.weddingId.toString() !== weddingId)
    throw fail(409, 'WEDDING_CONTEXT_CHANGED', 'Your wedding changed. Reload.');
  const tenant = new Types.ObjectId(weddingId),
    now = new Date();
  const summary = await repository.summary(
    tenant,
    userId,
    now,
    current.user.membershipVersion ?? 0,
  );
  const rows = await repository.assignedIncomplete(
    tenant,
    userId,
    current.user.membershipVersion ?? 0,
  );
  const assigned = await dtos(
    tenant,
    rows.filter((row) => row.status !== 'done').slice(0, 5),
    now,
  );
  return { summary, assigned };
}
export async function readTask(userId: string, id: string) {
  const { weddingId } = await context(userId);
  const row = await repository.find(
    weddingId,
    new Types.ObjectId(objectIdSchema.parse(id)),
  );
  if (!row) throw fail(404, 'NOT_FOUND', 'Task not found.');
  return {
    weddingId: weddingId.toString(),
    task: (await dtos(weddingId, [row], new Date()))[0],
  };
}
export async function taskOptions(userId: string, cursor?: string) {
  const { weddingId, timezone } = await context(userId);
  const rows = await weddingOrganizers(
    weddingId,
    cursor ? new Types.ObjectId(objectIdSchema.parse(cursor)) : undefined,
  );
  return {
    weddingId: weddingId.toString(),
    timezone,
    members: rows
      .slice(0, 25)
      .map((row) => ({ id: row._id.toString(), name: row.displayName })),
    nextCursor: rows.length > 25 ? rows[24]._id.toString() : null,
  };
}
export async function writeTask(
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
      ? taskPatch.parse(input)
      : taskInput.parse(input);
  const requestId = id
    ? undefined
    : hashSecret(
        `${userId}:${expectedWedding}:${inviteKeySchema.parse(options.key)}`,
      );
  const requestHash = requestId ? hashSecret(JSON.stringify(parsed)) : '';
  const db = await repository.database();
  return db.connection.transaction(async (session) => {
    const { weddingId } = await context(userId, session);
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
        // Re-resolve current assignees; never replay a former member's old profile.
        const row = await repository.find(weddingId, receipt.taskId, session);
        if (!row)
          throw fail(
            409,
            'TASK_ARCHIVED',
            'This request already created a task which was later removed. Refresh the list.',
          );
        return (await dtos(weddingId, [row], new Date(), session))[0];
      }
    }
    const current = id ? await repository.find(weddingId, id, session) : null;
    if (id && !current) throw fail(404, 'NOT_FOUND', 'Task not found.');
    if (current && current.__v !== options.version)
      throw fail(
        412,
        'PRECONDITION_FAILED',
        'This task changed. Your draft is kept; review the latest details before saving.',
      );
    const actor = new Types.ObjectId(userId);
    if (options.archive) {
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
          'Task changed. Reload and review.',
        );
      return (await dtos(weddingId, [row], new Date(), session))[0];
    }
    const data = taskInput.parse({
      ...(current
        ? {
            title: current.title,
            description: current.description,
            status: current.status,
            eventId: current.eventId?.toString() ?? null,
            assignedToUserId: current.assignedToUserId?.toString() ?? null,
            dueAt: current.dueAt?.toISOString() ?? null,
          }
        : {}),
      ...parsed,
    });
    if (data.eventId) {
      if (
        !(
          await planningEvents(
            weddingId,
            [new Types.ObjectId(data.eventId)],
            session,
          )
        ).length
      )
        throw fail(404, 'NOT_FOUND', 'Function not found.');
    }
    let assignedMembershipVersion = current?.assignedMembershipVersion ?? null;
    if (!data.assignedToUserId) assignedMembershipVersion = null;
    else if (
      !current ||
      data.assignedToUserId !== current.assignedToUserId?.toString()
    ) {
      const member = await weddingOrganizer(
        new Types.ObjectId(data.assignedToUserId),
        weddingId,
        session,
      );
      if (
        !member ||
        member.status !== 'active' ||
        !['admin', 'manager'].includes(member.role ?? '')
      )
        throw fail(404, 'NOT_FOUND', 'Organizer not found.');
      assignedMembershipVersion = member.membershipVersion ?? 0;
    }
    const record = {
      ...data,
      eventId: data.eventId ? new Types.ObjectId(data.eventId) : null,
      assignedToUserId: data.assignedToUserId
        ? new Types.ObjectId(data.assignedToUserId)
        : null,
      assignedMembershipVersion,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
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
        'Task changed. Reload and review.',
      );
    const result = (await dtos(weddingId, [row], new Date(), session))[0];
    if (requestId)
      await repository.recordRequest(
        { _id: requestId, weddingId, requestHash, taskId: row._id },
        session,
      );
    return result;
  });
}
