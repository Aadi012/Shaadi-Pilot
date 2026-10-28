import nextEnv from '@next/env';
import mongoose, { Types } from 'mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ cookie: '' }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    has: (name: string) =>
      context.cookie.split('; ').some((value) => value.startsWith(name + '=')),
    get: (name: string) => {
      const pair = context.cookie
        .split('; ')
        .find((value) => value.startsWith(name + '='));
      return pair ? { value: pair.slice(name.length + 1) } : undefined;
    },
  }),
}));
import { authIndexes } from '@/modules/auth/indexes';
import { weddingIndexes } from '@/modules/weddings/indexes';
import { emailIndexes } from '@/modules/email/indexes';
import { membershipIndexes } from '@/modules/memberships/indexes';
import { User, Session } from '@/modules/auth/models.server';
import { Wedding } from '@/modules/weddings/models.server';
import {
  MemberInvite,
  MemberInviteRequest,
} from '@/modules/memberships/models.server';
import { EmailDelivery, EmailBatch } from '@/modules/email/models.server';
import {
  hashSecret,
  newSecret,
  hashPassword,
} from '@/modules/auth/security.server';
import { decryptEmail } from '@/modules/email/crypto.server';
import { dispatchInvitationEmails } from '@/modules/email/service.server';
import {
  createInvitation,
  invitations,
  members,
  revokeInvitation,
  invitationView,
  acceptInvitation,
  invitationEmailEligible,
  removeManager,
} from '@/modules/memberships/service.server';
import {
  stageInvitationHandler,
  clearInvitationHandler,
  acceptInvitationHandler,
  createInvitationHandler,
  membersHandler,
  invitationsHandler,
  removeManagerHandler,
} from '@/modules/memberships/http.server';
import {
  authHandler,
  sessionHandler,
  cookieNames,
} from '@/modules/auth/http.server';
import {
  invitationCookieName,
  invitationCookieOptions,
} from '@/modules/memberships/context.server';
import * as inviteRepository from '@/modules/memberships/repository.server';
import { findSession } from '@/modules/auth/repository.server';
import {
  writeEvent,
  listEvents,
  readEvent,
} from '@/modules/events/service.server';
import {
  writeTask,
  listTasks,
  readTask,
  taskOverview,
  taskOptions,
} from '@/modules/tasks/service.server';
import { taskIndexes } from '@/modules/tasks/indexes';

const database = 'sp_mem_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
let sequence = 0;
const password = 'Isolated manager test passphrase!';
beforeAll(async () => {
  const previous = process.env.NODE_ENV;
  vi.stubEnv('NODE_ENV', 'development');
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  vi.stubEnv('NODE_ENV', previous);
  process.env.MONGODB_DB_NAME = database;
  process.env.APP_BASE_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = 're_mock_only';
  process.env.RESEND_FROM_EMAIL = 'test@example.test';
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.TOKEN_ENCRYPTION_KEY_ID = 'test-v1';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    if (!process.env.MONGODB_URI) throw new Error();
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: database,
      autoIndex: false,
      serverSelectionTimeoutMS: 8000,
    });
    for (const { collection, key, ...options } of [
      ...authIndexes,
      ...weddingIndexes,
      ...emailIndexes,
      ...membershipIndexes,
      ...taskIndexes,
    ])
      await mongoose.connection
        .collection(collection)
        .createIndex(key, options);
  } catch {
    throw new Error(
      'Isolated membership test setup failed; connection details withheld.',
    );
  }
});
afterAll(async () => {
  try {
    if (
      mongoose.connection.readyState === 1 &&
      mongoose.connection.name === database &&
      /^sp_mem_test_[a-f0-9]{24}$/.test(database)
    )
      await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});
async function user(email = `member-${++sequence}@example.test`) {
  return User.create({
    emailNormalized: email,
    displayName: 'Test organizer',
    passwordHash: await hashPassword(password),
    status: 'active',
    weddingId: null,
    role: null,
  });
}
async function wedding() {
  const admin = await user();
  const record = await Wedding.create({
    displayNames: { partnerOne: 'Aarav', partnerTwo: 'Ananya' },
    weddingDate: '2027-03-14',
    defaultLocation: { name: 'Jaipur' },
    timezone: 'Asia/Kolkata',
    slug: `test-${++sequence}`,
    createdBy: admin._id,
    status: 'active',
  });
  await User.updateOne(
    { _id: admin._id },
    { $set: { weddingId: record._id, role: 'admin' } },
  );
  return {
    admin,
    wedding: record,
    adminId: admin._id.toString(),
    weddingId: record._id.toString(),
  };
}
async function queued(
  scope: Awaited<ReturnType<typeof wedding>>,
  recipient: Awaited<ReturnType<typeof user>>,
  key = randomUUID(),
) {
  const result = await createInvitation(
    scope.adminId,
    { email: recipient.emailNormalized },
    key,
    scope.weddingId,
  );
  const record = await MemberInvite.findById(result.invitation.id)
    .select('+tokenHash')
    .lean();
  const batch = await EmailBatch.findById(record!.deliveryId)
    .select('+encrypted')
    .lean();
  const payload = decryptEmail(batch!.encrypted!, batch!._id.toString());
  const link = JSON.parse(payload)[0].text.match(/http[^\s]+/)[0];
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
  return { ...result, record: record!, token, payload, link, key };
}
async function cookie(userId: Types.ObjectId) {
  const token = newSecret();
  const now = new Date();
  await Session.create({
    userId,
    tokenHash: hashSecret(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + 3600000),
    absoluteExpiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  });
  return `${cookieNames().session}=${token}`;
}
type Handler = (request: Request, context: unknown) => Promise<Response>;
async function call(
  handler: Handler,
  options: {
    cookie?: string;
    body?: unknown;
    csrf?: string;
    origin?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {},
) {
  context.cookie = options.cookie ?? '';
  return handler(
    new Request('http://localhost:3000/api/v1/member-invites/context', {
      method: options.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.cookie,
        ...(options.origin === 'omit'
          ? {}
          : { Origin: options.origin ?? 'http://localhost:3000' }),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    }),
    undefined,
  );
}
async function bootstrap(authCookie = '') {
  const response = await call(sessionHandler, {
    cookie: authCookie,
    method: 'GET',
  });
  const data = (await response.json()).data;
  const csrfCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return {
    cookie: [authCookie, csrfCookie].filter(Boolean).join('; '),
    csrf: data.csrfToken,
  };
}
async function joinedManager(scope: Awaited<ReturnType<typeof wedding>>) {
  const account = await user();
  const invite = await queued(scope, account);
  await acceptInvitation(
    account._id.toString(),
    invite.token,
    invite.invitation.id,
  );
  const member = (await members(scope.adminId)).members.find(
    (row) => row.id === account._id.toString(),
  )!;
  return { account, invite, member };
}
function removeHttp(targetId: string, options: Parameters<typeof call>[1]) {
  return call(
    (request) =>
      removeManagerHandler(request, {
        params: Promise.resolve({ userId: targetId }),
      }),
    { ...options, method: 'DELETE' },
  );
}
describe('Functions', () => {
  const input = {
    title: 'Sangeet',
    description: 'Celebration',
    startsAt: '2027-03-13T14:00:00Z',
    endsAt: '2027-03-13T20:00:00Z',
    timezone: 'Asia/Kolkata',
    venue: { name: 'Grand ballroom', address: 'Jaipur' },
  };
  it('isolates tenants, supports Manager edits and rejects stale versions', async () => {
    const a = await wedding(),
      b = await wedding();
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: a.wedding._id, role: 'manager' } },
    );
    const row = await writeEvent(
      a.adminId,
      a.weddingId,
      input,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    expect((await listEvents(b.adminId)).events).toHaveLength(0);
    await expect(readEvent(b.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeEvent(
        a.adminId,
        b.weddingId,
        input,
        undefined,
        undefined,
        false,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const edited = await writeEvent(
      manager._id.toString(),
      a.weddingId,
      { ...input, title: 'Edited' },
      row.id,
      0,
    );
    expect(edited.version).toBe(1);
    await expect(
      writeEvent(a.adminId, a.weddingId, input, row.id, 0),
    ).rejects.toMatchObject({ status: 412 });
  });
  it('blocks linked removal and archives only an unlinked function', async () => {
    const a = await wedding();
    const row = await writeEvent(
      a.adminId,
      a.weddingId,
      input,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    const task = await mongoose.connection.collection('tasks').insertOne({
      weddingId: a.wedding._id,
      eventId: new Types.ObjectId(row.id),
    });
    await expect(
      writeEvent(a.adminId, a.weddingId, undefined, row.id, 0, true),
    ).rejects.toMatchObject({ code: 'FUNCTION_HAS_LINKS' });
    await mongoose.connection
      .collection('tasks')
      .deleteOne({ _id: task.insertedId });
    await writeEvent(a.adminId, a.weddingId, undefined, row.id, 0, true);
    expect((await listEvents(a.adminId)).events).toHaveLength(0);
    await expect(readEvent(a.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
describe('Tasks and durable planning creates', () => {
  const eventInput = {
    title: 'Task function',
    startsAt: '2027-03-13T14:00:00Z',
    endsAt: '2027-03-13T20:00:00Z',
    timezone: 'Asia/Kolkata',
    venue: { name: 'Test hall' },
  };
  it('serializes identical function creates and rejects changed-payload key reuse', async () => {
    const a = await wedding(),
      key = randomUUID();
    const results = await Promise.all(
      [1, 2].map(() =>
        writeEvent(
          a.adminId,
          a.weddingId,
          eventInput,
          undefined,
          undefined,
          false,
          key,
        ),
      ),
    );
    expect(results[0].id).toBe(results[1].id);
    expect((await listEvents(a.adminId)).events).toHaveLength(1);
    await expect(
      writeEvent(
        a.adminId,
        a.weddingId,
        { ...eventInput, title: 'Changed' },
        undefined,
        undefined,
        false,
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await writeEvent(a.adminId, a.weddingId, undefined, results[0].id, 0, true);
    await expect(
      writeEvent(
        a.adminId,
        a.weddingId,
        eventInput,
        undefined,
        undefined,
        false,
        key,
      ),
    ).rejects.toMatchObject({ code: 'FUNCTION_ARCHIVED' });
  });
  it('allows a Manager to assign an Admin, complete tasks and update real summaries', async () => {
    const a = await wedding(),
      { account } = await joinedManager(a);
    const row = await writeTask(
      account.id,
      a.weddingId,
      {
        title: 'Venue call',
        assignedToUserId: a.adminId,
        dueAt: '2020-01-01T00:00:00Z',
      },
      { key: randomUUID() },
    );
    expect(row.assignee).toEqual({
      state: 'active',
      name: a.admin.displayName,
    });
    expect(row.overdue).toBe(true);
    expect((await taskOverview(a.weddingId, a.adminId)).summary).toMatchObject({
      total: 1,
      overdue: 1,
      assigned: 1,
      done: 0,
    });
    const done = await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'done' },
      { id: row.id, version: 0 },
    );
    expect(done.overdue).toBe(false);
    expect((await taskOverview(a.weddingId, a.adminId)).summary).toMatchObject({
      total: 1,
      overdue: 0,
      assigned: 0,
      done: 1,
    });
    expect(
      (await taskOptions(account.id)).members.some((m) => m.id === a.adminId),
    ).toBe(true);
  });
  it('rejects foreign references, stale wedding context, stale edits and removed actors', async () => {
    const a = await wedding(),
      b = await wedding();
    const event = await writeEvent(
      b.adminId,
      b.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    for (const input of [
      { title: 'Foreign organizer', assignedToUserId: b.adminId },
      { title: 'Foreign event', eventId: event.id },
    ])
      await expect(
        writeTask(a.adminId, a.weddingId, input, { key: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      writeTask(
        a.adminId,
        b.weddingId,
        { title: 'Wrong context' },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 409 });
    const row = await writeTask(
      a.adminId,
      a.weddingId,
      { title: 'Local' },
      { key: randomUUID() },
    );
    await expect(readTask(b.adminId, row.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      writeTask(
        b.adminId,
        b.weddingId,
        { title: 'Attack' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'inProgress' },
      { id: row.id, version: 0 },
    );
    await expect(
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Stale' },
        { id: row.id, version: 0 },
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect((await listTasks(b.adminId, {})).tasks).toHaveLength(0);
  });
  it('retains former assignments without resolving a profile in another wedding', async () => {
    const a = await wedding(),
      b = await wedding(),
      { account, member } = await joinedManager(a);
    const row = await writeTask(
      a.adminId,
      a.weddingId,
      { title: 'Assigned task', assignedToUserId: account.id },
      { key: randomUUID() },
    );
    const receiptKey = randomUUID();
    const original = {
      title: 'Retry after removal',
      assignedToUserId: account.id,
    };
    const receipt = await writeTask(a.adminId, a.weddingId, original, {
      key: receiptKey,
    });
    await removeManager(
      a.adminId,
      member.id,
      a.weddingId,
      member.membershipVersion,
    );
    await User.updateOne(
      { _id: account._id },
      {
        $set: {
          weddingId: b.wedding._id,
          role: 'manager',
          displayName: 'Private foreign profile',
        },
      },
    );
    expect((await readTask(a.adminId, row.id)).task.assignee).toEqual({
      state: 'former',
      name: null,
    });
    expect(
      (await writeTask(a.adminId, a.weddingId, original, { key: receiptKey }))
        .assignee,
    ).toEqual({ state: 'former', name: null });
    await expect(
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'New', assignedToUserId: account.id },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await writeTask(
          a.adminId,
          a.weddingId,
          { status: 'done' },
          { id: row.id, version: 0 },
        )
      ).assignee.state,
    ).toBe('former');
    expect(
      (
        await writeTask(
          a.adminId,
          a.weddingId,
          { assignedToUserId: null },
          { id: row.id, version: 1 },
        )
      ).assignee.state,
    ).toBe('unassigned');
    expect(receipt.id).toBeDefined();
  });
  it('deduplicates concurrent creates, rejects key reuse and never recreates archived tasks', async () => {
    const a = await wedding(),
      key = randomUUID(),
      input = { title: 'Once' };
    const [first, second] = await Promise.all(
      [1, 2].map(() => writeTask(a.adminId, a.weddingId, input, { key })),
    );
    expect(first.id).toBe(second.id);
    expect((await listTasks(a.adminId, {})).summary.total).toBe(1);
    await expect(
      writeTask(a.adminId, a.weddingId, { title: 'Changed' }, { key }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await writeTask(
      a.adminId,
      a.weddingId,
      { status: 'done' },
      { id: first.id, version: 0 },
    );
    expect((await listTasks(a.adminId, {})).summary.unassigned).toBe(0);
    expect(
      (await writeTask(a.adminId, a.weddingId, input, { key })).status,
    ).toBe('done');
    await writeTask(a.adminId, a.weddingId, undefined, {
      id: first.id,
      version: 1,
      archive: true,
    });
    await expect(
      writeTask(a.adminId, a.weddingId, input, { key }),
    ).rejects.toMatchObject({ code: 'TASK_ARCHIVED' });
    expect((await listTasks(a.adminId, {})).summary.total).toBe(0);
  });
  it('pages stable filters without duplicates and binds cursors to those filters', async () => {
    const a = await wedding();
    for (let n = 0; n < 4; n++)
      await writeTask(
        a.adminId,
        a.weddingId,
        {
          title: 'Page ' + n,
          status: n === 0 ? 'done' : 'todo',
          dueAt: n === 1 ? '2020-01-01T00:00:00Z' : null,
        },
        { key: randomUUID() },
      );
    const first = await listTasks(a.adminId, { status: 'todo', limit: 2 });
    const second = await listTasks(a.adminId, {
      status: 'todo',
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(
      new Set([...first.tasks, ...second.tasks].map((t) => t.id)).size,
    ).toBe(3);
    expect(second.nextCursor).toBe(null);
    await expect(
      listTasks(a.adminId, {
        status: 'done',
        limit: 2,
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await listTasks(a.adminId, { overdue: 'true' })).tasks,
    ).toHaveLength(1);
    expect(
      (
        await listTasks(a.adminId, {
          assignedToUserId: 'unassigned',
          dueBefore: '2021-01-01T00:00:00Z',
        })
      ).tasks,
    ).toHaveLength(1);
  });
  it('serializes function archival against task reference creation', async () => {
    const a = await wedding();
    const event = await writeEvent(
      a.adminId,
      a.weddingId,
      eventInput,
      undefined,
      undefined,
      false,
      randomUUID(),
    );
    const results = await Promise.allSettled([
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Linked', eventId: event.id },
        { key: randomUUID() },
      ),
      writeEvent(a.adminId, a.weddingId, undefined, event.id, 0, true),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const tasks = await listTasks(a.adminId, {});
    if (tasks.tasks.length) {
      expect((await listEvents(a.adminId)).events).toHaveLength(1);
      expect(results[1]).toMatchObject({
        status: 'rejected',
        reason: { code: 'FUNCTION_HAS_LINKS' },
      });
    } else
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 404 },
      });
  });
  it('serializes Manager removal against assignment and denies later writes', async () => {
    const a = await wedding(),
      { account, member } = await joinedManager(a);
    const results = await Promise.allSettled([
      writeTask(
        a.adminId,
        a.weddingId,
        { title: 'Race assignment', assignedToUserId: account.id },
        { key: randomUUID() },
      ),
      removeManager(
        a.adminId,
        member.id,
        a.weddingId,
        member.membershipVersion,
      ),
    ]);
    expect(results[1].status).toBe('fulfilled');
    const tasks = await listTasks(a.adminId, {});
    if (tasks.tasks.length)
      expect(tasks.tasks[0].assignee).toEqual({ state: 'former', name: null });
    else
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: { status: 404 },
      });
    await expect(
      writeTask(
        account.id,
        a.weddingId,
        { title: 'Removed writer' },
        { key: randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('Manager removal', () => {
  it('detaches only this membership, invalidates all sessions and invitations, and retains the account and planning records', async () => {
    const scope = await wedding();
    const { account, invite, member } = await joinedManager(scope);
    const cookies = [await cookie(account._id), await cookie(account._id)];
    const adminCookie = await cookie(scope.admin._id);
    const pendingToken = newSecret();
    await MemberInvite.create({
      ...invite.record,
      _id: new Types.ObjectId(),
      tokenHash: hashSecret(pendingToken),
      deliveryId: new Types.ObjectId(),
    });
    const before = await User.findById(account._id)
      .select('+passwordHash')
      .lean();
    const task = await mongoose.connection.collection('tasks').insertOne({
      weddingId: scope.wedding._id,
      assigneeId: account._id,
      title: 'Existing planning record',
    });
    expect(
      await removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
    ).toEqual({ removed: true });
    const after = await User.findById(account._id)
      .select('+passwordHash')
      .lean();
    expect(after).toMatchObject({
      weddingId: null,
      role: null,
      status: 'active',
      passwordHash: before!.passwordHash,
      membershipVersion: member.membershipVersion + 1,
    });
    expect(
      await Session.countDocuments({ userId: account._id, revokedAt: null }),
    ).toBe(0);
    for (const authCookie of cookies) {
      expect(await findSession(authCookie.split('=')[1])).toBeNull();
      expect(
        (await call(membersHandler, { cookie: authCookie, method: 'GET' }))
          .status,
      ).toBe(401);
    }
    expect(await findSession(adminCookie.split('=')[1])).not.toBeNull();
    expect(await invitationView(pendingToken, member.id)).toEqual({
      state: 'invalid',
    });
    expect(await invitationView(invite.token, member.id)).toEqual({
      state: 'invalid',
    });
    await expect(
      acceptInvitation(member.id, invite.token, invite.invitation.id),
    ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    expect(
      await invitationEmailEligible(
        scope.adminId,
        hashSecret(invite.token),
        new Date(),
        scope.weddingId,
      ),
    ).toBe(false);
    expect(
      await mongoose.connection
        .collection('tasks')
        .countDocuments({ _id: task.insertedId, weddingId: scope.wedding._id }),
    ).toBe(1);
    const anon = await bootstrap();
    const login = await call(authHandler('login'), {
      ...anon,
      body: { email: account.emailNormalized, password },
    });
    expect(login.status).toBe(200);
    expect((await login.json()).data.user).toMatchObject({
      weddingId: null,
      role: null,
    });
  });
  it('rejects Managers, self/Admin removal, foreign members and stale wedding context', async () => {
    const scope = await wedding();
    const other = await wedding();
    const { member } = await joinedManager(scope);
    await expect(
      removeManager(member.id, scope.adminId, scope.weddingId, 0),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeManager(scope.adminId, scope.adminId, scope.weddingId, 0),
    ).rejects.toMatchObject({ status: 403 });
    const secondAdmin = await user();
    await User.updateOne(
      { _id: secondAdmin._id },
      { $set: { weddingId: scope.wedding._id, role: 'admin' } },
    );
    await expect(
      removeManager(
        scope.adminId,
        secondAdmin._id.toString(),
        scope.weddingId,
        0,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeManager(
        other.adminId,
        member.id,
        other.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      removeManager(
        scope.adminId,
        member.id,
        other.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    expect(
      (await members(scope.adminId)).members.map((row) => row.id),
    ).toContain(member.id);
  });
  it('requires a new invitation to rejoin and rejects removal from an older membership generation', async () => {
    const scope = await wedding();
    const { account, member } = await joinedManager(scope);
    await removeManager(
      scope.adminId,
      member.id,
      scope.weddingId,
      member.membershipVersion,
    );
    const fresh = await queued(scope, account);
    await acceptInvitation(member.id, fresh.token, fresh.invitation.id);
    const current = (await members(scope.adminId)).members.find(
      (row) => row.id === member.id,
    )!;
    expect(current.membershipVersion).toBe(member.membershipVersion + 2);
    const newCookie = await cookie(account._id);
    await expect(
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect(await findSession(newCookie.split('=')[1])).not.toBeNull();
    expect(
      (await User.findById(account._id).lean())!.weddingId?.toString(),
    ).toBe(scope.weddingId);
  });
  it('serializes concurrent deletes and prevents old acceptance from restoring removed access', async () => {
    const scope = await wedding();
    const { account, member, invite } = await joinedManager(scope);
    const results = await Promise.allSettled([
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
      removeManager(
        scope.adminId,
        member.id,
        scope.weddingId,
        member.membershipVersion,
      ),
      acceptInvitation(member.id, invite.token, invite.invitation.id),
    ]);
    expect(
      results.slice(0, 2).filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await User.findById(account._id).lean())!.weddingId).toBeNull();
    expect(await invitationView(invite.token, member.id)).toEqual({
      state: 'invalid',
    });
  });
  it('rolls back detachment and session revocation if invitation invalidation fails', async () => {
    const scope = await wedding();
    const { account, member, invite } = await joinedManager(scope);
    const authCookie = await cookie(account._id);
    const spy = vi
      .spyOn(inviteRepository, 'invalidateMemberInvitations')
      .mockRejectedValueOnce(new Error('Synthetic failure'));
    try {
      await expect(
        removeManager(
          scope.adminId,
          member.id,
          scope.weddingId,
          member.membershipVersion,
        ),
      ).rejects.toBeDefined();
    } finally {
      spy.mockRestore();
    }
    expect(
      (await User.findById(account._id).lean())!.weddingId?.toString(),
    ).toBe(scope.weddingId);
    expect(await findSession(authCookie.split('=')[1])).not.toBeNull();
    expect((await invitationView(invite.token, member.id)).state).toBe(
      'already-member',
    );
  });
  it('handles legacy missing version and does not invalidate another weddings invitations', async () => {
    const scope = await wedding();
    const other = await wedding();
    const account = await user();
    const otherInvite = await queued(other, account);
    await User.updateOne(
      { _id: account._id },
      {
        $set: { weddingId: scope.wedding._id, role: 'manager' },
        $unset: { membershipVersion: 1 },
      },
    );
    const dto = (await members(scope.adminId)).members.find(
      (row) => row.id === account._id.toString(),
    )!;
    expect(dto.membershipVersion).toBe(0);
    await removeManager(scope.adminId, dto.id, scope.weddingId, 0);
    expect((await invitationView(otherInvite.token, dto.id)).state).toBe(
      'eligible',
    );
  });
  it('enforces HTTP authentication, Origin, CSRF, membership preconditions and no-body contract', async () => {
    const scope = await wedding();
    const { account, member } = await joinedManager(scope);
    const admin = await bootstrap(await cookie(scope.admin._id));
    const headers = {
      'X-Wedding-Context': scope.weddingId,
      'If-Match': `"${member.membershipVersion}"`,
    };
    expect(
      (await removeHttp(member.id, { ...admin, headers, origin: 'omit' }))
        .status,
    ).toBe(403);
    expect(
      (await removeHttp(member.id, { cookie: admin.cookie, headers })).status,
    ).toBe(403);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { 'X-Wedding-Context': scope.weddingId },
        })
      ).status,
    ).toBe(428);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { ...headers, 'If-Match': 'W/"1"' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers,
          body: { role: 'admin' },
        })
      ).status,
    ).toBe(400);
    const manager = await bootstrap(await cookie(account._id));
    expect((await removeHttp(member.id, { ...manager, headers })).status).toBe(
      403,
    );
    expect(
      (
        await removeHttp(member.id, {
          ...admin,
          headers: { ...headers, 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    const response = await removeHttp(member.id, { ...admin, headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await removeHttp(member.id, { ...admin, headers })).status).toBe(
      404,
    );
  });
});

describe('Manager invitation transactions', () => {
  it('paginates organizer and invitation lists without crossing the wedding boundary', async () => {
    const scope = await wedding();
    const other = await wedding();
    const now = new Date();
    await User.insertMany(
      Array.from({ length: 26 }, (_, index) => ({
        emailNormalized: `page-${++sequence}-${index}@example.test`,
        displayName: 'Page organizer',
        passwordHash: 'unused-test-only',
        weddingId: scope.wedding._id,
        role: 'manager',
        status: 'active',
      })),
    );
    await MemberInvite.insertMany(
      Array.from({ length: 26 }, (_, index) => ({
        weddingId: scope.wedding._id,
        emailNormalized: `invite-${++sequence}-${index}@example.test`,
        invitedRole: 'manager',
        invitedBy: scope.admin._id,
        tokenHash: hashSecret(newSecret()),
        state: 'pending',
        expiresAt: new Date(now.getTime() + 86400000),
        createdAt: now,
        deliveryId: new Types.ObjectId(),
      })),
    );
    const first = await members(scope.adminId);
    const second = await members(scope.adminId, first.nextCursor!);
    expect(first.members).toHaveLength(25);
    expect(second.members).toHaveLength(2);
    expect(
      new Set([...first.members, ...second.members].map((row) => row.id)).size,
    ).toBe(27);
    const invites = await invitations(scope.adminId);
    const rest = await invitations(scope.adminId, invites.nextCursor!);
    expect(invites.invitations).toHaveLength(25);
    expect(rest.invitations).toHaveLength(1);
    expect(
      new Set(
        [...invites.invitations, ...rest.invitations].map((row) => row.id),
      ).size,
    ).toBe(26);
    expect((await invitations(other.adminId)).invitations).toHaveLength(0);
  });
  it('retries mock invitations with exactly the same payload and provider key', async () => {
    const scope = await wedding();
    const invite = await queued(scope, await user());
    const send = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'retry', category: 'network' })
      .mockResolvedValueOnce({ kind: 'submitted', id: 'mock-retry' });
    const options = { id: invite.record.deliveryId.toString(), limit: 1 };
    expect(
      (await dispatchInvitationEmails(invitationEmailEligible, options, send))
        .retry,
    ).toBe(1);
    await EmailDelivery.updateOne(
      { _id: invite.record.deliveryId },
      { $set: { nextAttemptAt: new Date(0) } },
    );
    expect(
      (await dispatchInvitationEmails(invitationEmailEligible, options, send))
        .submitted,
    ).toBe(1);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  });
  it('stores hashes and encrypted email, exposes no secret, and reveals no public wedding or recipient', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    expect(invite.record.tokenHash).toBe(hashSecret(invite.token));
    expect(JSON.stringify(invite.invitation)).not.toContain(invite.token);
    expect(invite.link).toContain('/join#token=');
    const stored = await EmailBatch.findById(invite.record.deliveryId)
      .select('+encrypted')
      .lean();
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    expect(JSON.stringify(stored)).not.toContain(recipient.emailNormalized);
    expect(await invitationView(invite.token)).toEqual({ state: 'signed-out' });
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('eligible');
    expect(
      (await invitationView(invite.token, (await user())._id.toString())).state,
    ).toBe('wrong-email');
  });
  it('deduplicates concurrent invitations, preserves receipts and rejects changed idempotent payload', async () => {
    const scope = await wedding();
    const recipient = await user();
    const key = randomUUID();
    const run = (requestKey: string) =>
      createInvitation(
        scope.adminId,
        { email: recipient.emailNormalized },
        requestKey,
        scope.weddingId,
      );
    const results = await Promise.all([run(key), run(randomUUID()), run(key)]);
    expect(new Set(results.map((result) => result.invitation.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(
      await MemberInvite.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(1);
    expect(
      await EmailDelivery.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(1);
    expect(
      await MemberInviteRequest.countDocuments({
        weddingId: scope.wedding._id,
      }),
    ).toBe(2);
    await expect(
      createInvitation(
        scope.adminId,
        { email: 'different@example.test' },
        key,
        scope.weddingId,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('enforces roles, strict inputs, trusted wedding context and tenant-scoped reads/revocation', async () => {
    const a = await wedding();
    const b = await wedding();
    const recipient = await user();
    const invite = await queued(a, recipient);
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: a.wedding._id, role: 'manager' } },
    );
    const id = recipient._id.toString();
    await expect(invitations(id)).rejects.toMatchObject({ status: 403 });
    await expect(
      createInvitation(
        id,
        { email: 'new@example.test' },
        randomUUID(),
        a.weddingId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      revokeInvitation(id, invite.invitation.id, a.weddingId),
    ).rejects.toMatchObject({ status: 403 });
    expect((await members(id)).members).toHaveLength(2);
    expect((await invitations(b.adminId)).invitations).toHaveLength(0);
    await expect(
      revokeInvitation(b.adminId, invite.invitation.id, b.weddingId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test' },
        randomUUID(),
        b.weddingId,
      ),
    ).rejects.toMatchObject({ code: 'WEDDING_CONTEXT_CHANGED' });
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test', invitedRole: 'admin' },
        randomUUID(),
        a.weddingId,
      ),
    ).rejects.toBeDefined();
    await expect(
      createInvitation(
        a.adminId,
        { email: 'new@example.test' },
        'invalid',
        a.weddingId,
      ),
    ).rejects.toBeDefined();
  });
  it('accepts exactly once as Manager and safely replays concurrent/lost-response retries', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ),
    );
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await User.findById(recipient._id).lean()).toMatchObject({
      role: 'manager',
      weddingId: scope.wedding._id,
    });
    expect(
      await MemberInvite.findById(invite.invitation.id).lean(),
    ).toMatchObject({ state: 'accepted', consumedBy: recipient._id });
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('already-member');
    expect(
      await invitationEmailEligible(
        scope.adminId,
        hashSecret(invite.token),
        new Date(),
        scope.weddingId,
      ),
    ).toBe(false);
    await expect(
      revokeInvitation(scope.adminId, invite.invitation.id, scope.weddingId),
    ).rejects.toMatchObject({ code: 'INVITATION_ALREADY_ACCEPTED' });
  });
  it('never attaches a wrong email, another wedding, a disabled account or an invalid token', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const other = await user();
    await expect(
      acceptInvitation(
        other._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        newSecret(),
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        new Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({ code: 'INVITATION_CONTEXT_CHANGED' });
    const second = await wedding();
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: second.wedding._id, role: 'manager' } },
    );
    expect(
      (await invitationView(invite.token, recipient._id.toString())).state,
    ).toBe('other-wedding');
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ code: 'USER_ALREADY_IN_WEDDING' });
    await User.updateOne(
      { _id: recipient._id },
      { $set: { weddingId: null, role: null, status: 'disabled' } },
    );
    await expect(
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await MemberInvite.findById(invite.invitation.id).lean())!.state,
    ).toBe('pending');
  });
  it('allows only one wedding to win simultaneous acceptance', async () => {
    const a = await wedding();
    const b = await wedding();
    const recipient = await user();
    const ia = await queued(a, recipient);
    const ib = await queued(b, recipient);
    const results = await Promise.allSettled(
      [ia, ib].map((invite) =>
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await MemberInvite.countDocuments({
        _id: { $in: [ia.record._id, ib.record._id] },
        state: 'accepted',
      }),
    ).toBe(1);
  });
  it('serializes revoke versus accept and makes repeat revocation safe', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const results = await Promise.allSettled([
      revokeInvitation(scope.adminId, invite.invitation.id, scope.weddingId),
      acceptInvitation(
        recipient._id.toString(),
        invite.token,
        invite.invitation.id,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const record = await MemberInvite.findById(invite.invitation.id).lean();
    expect(
      (await User.findById(recipient._id).lean())!.weddingId?.toString() ??
        null,
    ).toBe(record!.state === 'accepted' ? scope.weddingId : null);
    if (record!.state === 'revoked')
      expect(
        (
          await revokeInvitation(
            scope.adminId,
            invite.invitation.id,
            scope.weddingId,
          )
        ).state,
      ).toBe('revoked');
  });
  it('invalidates expiry, revocation, archived weddings and disabled inviters', async () => {
    for (const mode of [
      'expired',
      'revoked',
      'archived',
      'disabled',
    ] as const) {
      const scope = await wedding();
      const recipient = await user();
      const invite = await queued(scope, recipient);
      if (mode === 'expired')
        await MemberInvite.updateOne(
          { _id: invite.record._id },
          { $set: { expiresAt: new Date(0) } },
        );
      if (mode === 'revoked')
        await revokeInvitation(
          scope.adminId,
          invite.invitation.id,
          scope.weddingId,
        );
      if (mode === 'archived')
        await Wedding.updateOne(
          { _id: scope.wedding._id },
          { $set: { status: 'archived' } },
        );
      if (mode === 'disabled')
        await User.updateOne(
          { _id: scope.admin._id },
          { $set: { status: 'disabled' } },
        );
      expect(await invitationView(invite.token)).toEqual({ state: 'invalid' });
      await expect(
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    }
  });
  it('rolls back a successful membership claim if invitation consumption fails', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const spy = vi
      .spyOn(inviteRepository, 'consumeInvite')
      .mockRejectedValueOnce(new Error('Synthetic failure'));
    try {
      await expect(
        acceptInvitation(
          recipient._id.toString(),
          invite.token,
          invite.invitation.id,
        ),
      ).rejects.toBeDefined();
    } finally {
      spy.mockRestore();
    }
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
    expect((await MemberInvite.findById(invite.record._id).lean())!.state).toBe(
      'pending',
    );
  });
  it('rolls back invitation and receipt if email configuration is absent', async () => {
    const scope = await wedding();
    const saved = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = '';
    try {
      await expect(
        createInvitation(
          scope.adminId,
          { email: 'missing@example.test' },
          randomUUID(),
          scope.weddingId,
        ),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
    expect(
      await MemberInvite.countDocuments({ weddingId: scope.wedding._id }),
    ).toBe(0);
    expect(
      await MemberInviteRequest.countDocuments({
        weddingId: scope.wedding._id,
      }),
    ).toBe(0);
  });
  it('reissues after expiry without reusing a private capability', async () => {
    const scope = await wedding();
    const recipient = await user();
    const old = await queued(scope, recipient);
    await MemberInvite.updateOne(
      { _id: old.record._id },
      { $set: { expiresAt: new Date(0) } },
    );
    const fresh = await queued(scope, recipient);
    expect(fresh.token).not.toBe(old.token);
    expect((await MemberInvite.findById(old.record._id).lean())!.state).toBe(
      'expired',
    );
    expect(
      await MemberInvite.countDocuments({
        weddingId: scope.wedding._id,
        state: 'pending',
      }),
    ).toBe(1);
  });
  it('submits immutable mock mail, scopes status and cancels revoked mail before submission', async () => {
    const scope = await wedding();
    const other = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const send = vi.fn(async () => ({
      kind: 'submitted' as const,
      id: 'mock-message',
    }));
    expect(
      (
        await dispatchInvitationEmails(
          invitationEmailEligible,
          { id: invite.record.deliveryId.toString(), limit: 1 },
          send,
        )
      ).submitted,
    ).toBe(1);
    expect(send).toHaveBeenCalledWith(
      invite.payload,
      `member-invite/${invite.record.deliveryId}`,
    );
    expect((await invitations(scope.adminId)).invitations[0].delivery).toBe(
      'submitted',
    );
    expect((await invitations(other.adminId)).invitations).toHaveLength(0);
    const pending = await queued(scope, await user());
    await revokeInvitation(
      scope.adminId,
      pending.invitation.id,
      scope.weddingId,
    );
    expect(
      (
        await dispatchInvitationEmails(
          invitationEmailEligible,
          { id: pending.record.deliveryId.toString(), limit: 1 },
          send,
        )
      ).cancelled,
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
describe('Invitation HTTP boundaries', () => {
  it('requires Origin and CSRF even when staging anonymous capabilities', async () => {
    const scope = await wedding();
    const invite = await queued(scope, await user());
    expect(
      (
        await call(stageInvitationHandler, {
          body: { token: invite.token },
          origin: 'omit',
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(stageInvitationHandler, { body: { token: invite.token } }))
        .status,
    ).toBe(403);
    const anon = await bootstrap();
    const response = await call(stageInvitationHandler, {
      ...anon,
      body: { token: invite.token },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ state: 'signed-out' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const set = response.headers.getSetCookie().join(';');
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=lax');
    expect(set).toContain('Max-Age=900');
    expect(invitationCookieOptions().secure).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    expect(invitationCookieName()).toBe('__Host-shaadipilot_invitation');
    expect(invitationCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      path: '/',
    });
    vi.stubEnv('NODE_ENV', 'test');
  });
  it('carries staged context through real login with a fixed allowlisted destination', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const anon = await bootstrap();
    const staged = await call(stageInvitationHandler, {
      ...anon,
      body: { token: invite.token },
    });
    const pending = staged.headers.getSetCookie()[0].split(';')[0];
    const response = await call(authHandler('login'), {
      ...anon,
      cookie: anon.cookie + '; ' + pending,
      body: { email: recipient.emailNormalized, password },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.redirectTo).toBe('/join');
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
  });
  it('rejects cross-tab account or invitation changes before membership writes', async () => {
    const scope = await wedding();
    const recipient = await user();
    const invite = await queued(scope, recipient);
    const signed = await bootstrap(await cookie(recipient._id));
    const withInvite = {
      ...signed,
      cookie: signed.cookie + `; ${invitationCookieName()}=${invite.token}`,
    };
    const response = await call(acceptInvitationHandler, {
      ...withInvite,
      body: { invitationId: invite.invitation.id },
      headers: { 'X-Organizer-Context': new Types.ObjectId().toString() },
    });
    expect(response.status).toBe(409);
    expect(
      (
        await call(acceptInvitationHandler, {
          ...withInvite,
          body: { invitationId: new Types.ObjectId().toString() },
          headers: { 'X-Organizer-Context': recipient._id.toString() },
        })
      ).status,
    ).toBe(409);
    expect((await User.findById(recipient._id).lean())!.weddingId).toBeNull();
    const accepted = await call(acceptInvitationHandler, {
      ...withInvite,
      body: { invitationId: invite.invitation.id },
      headers: { 'X-Organizer-Context': recipient._id.toString() },
    });
    expect(accepted.status).toBe(200);
    expect(
      (
        await call(clearInvitationHandler, { ...withInvite, method: 'DELETE' })
      ).headers
        .getSetCookie()
        .join(';'),
    ).toContain('Max-Age=0');
  });
  it('enforces direct API authorization, strict query and required request guards', async () => {
    expect((await call(membersHandler, { method: 'GET' })).status).toBe(401);
    const scope = await wedding();
    const signed = await bootstrap(await cookie(scope.admin._id));
    const schedule = vi.fn();
    const handler = createInvitationHandler(schedule);
    expect(
      (
        await call(handler, {
          ...signed,
          body: { email: 'guard@example.test' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(handler, {
          ...signed,
          body: { email: 'guard@example.test' },
          headers: {
            'X-Wedding-Context': new Types.ObjectId().toString(),
            'Idempotency-Key': randomUUID(),
          },
        })
      ).status,
    ).toBe(409);
    expect(schedule).not.toHaveBeenCalled();
    const manager = await user();
    await User.updateOne(
      { _id: manager._id },
      { $set: { weddingId: scope.wedding._id, role: 'manager' } },
    );
    expect(
      (
        await call(invitationsHandler, {
          cookie: await cookie(manager._id),
          method: 'GET',
        })
      ).status,
    ).toBe(403);
  });
});
