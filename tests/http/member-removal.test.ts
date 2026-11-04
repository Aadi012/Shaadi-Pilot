import nextEnv from '@next/env';
import mongoose, { Types } from 'mongoose';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authIndexes } from '@/modules/auth/indexes';
import { weddingIndexes } from '@/modules/weddings/indexes';
import { membershipIndexes } from '@/modules/memberships/indexes';
import { expenseIndexes } from '@/modules/expenses/indexes';
import { vendorIndexes } from '@/modules/vendors/indexes';
import { galleryIndexes } from '@/modules/gallery/indexes';
import { invitationIndexes } from '@/modules/invitations/indexes';

const database =
  'sp_http_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
const origin = 'https://shaadipilot-http.example.test';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
let connection: mongoose.Connection | undefined;
let server: ChildProcess | undefined;
let base: string;
let admin: Types.ObjectId;
let wedding: Types.ObjectId;
let adminSecret: string;

function headers(token: string) {
  return {
    Origin: origin,
    Cookie: `__Host-shaadipilot_session=${token}`,
    'X-CSRF-Token': createHmac('sha256', token)
      .update('shaadipilot:csrf:v1')
      .digest('hex'),
    'X-Wedding-Context': wedding.toString(),
    'If-Match': '"1"',
  };
}
async function session(userId: Types.ObjectId) {
  const token = secret();
  const now = new Date();
  await connection!.collection('sessions').insertOne({
    userId,
    tokenHash: hash(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + 3600000),
    absoluteExpiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  });
  return token;
}
async function manager() {
  const id = new Types.ObjectId();
  const email = `${id}@example.test`;
  await connection!.collection('users').insertOne({
    _id: id,
    emailNormalized: email,
    displayName: 'HTTP regression Manager',
    passwordHash: 'unused-fixture-hash',
    status: 'active',
    weddingId: wedding,
    role: 'manager',
    membershipVersion: 1,
  });
  const tokens = [await session(id), await session(id)];
  const inviteId = new Types.ObjectId();
  await connection!.collection('memberInvites').insertOne({
    _id: inviteId,
    weddingId: wedding,
    emailNormalized: email,
    invitedRole: 'manager',
    invitedBy: admin,
    tokenHash: hash(secret()),
    state: 'accepted',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    consumedAt: new Date(),
    consumedBy: id,
    revokedAt: null,
    deliveryId: new Types.ObjectId(),
  });
  return { id, tokens, inviteId };
}
beforeAll(async () => {
  // Match the other DB suites: .env.local supplies only the connection URI.
  // Every write uses a fresh test database, never the configured application DB.
  const previous = process.env.NODE_ENV;
  vi.stubEnv('NODE_ENV', 'development');
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  } finally {
    vi.stubEnv('NODE_ENV', previous);
  }
  try {
    await access('.next/BUILD_ID');
    if (!process.env.MONGODB_URI) throw new Error();
    connection = await mongoose
      .createConnection(process.env.MONGODB_URI, {
        dbName: database,
        autoIndex: false,
        serverSelectionTimeoutMS: 8000,
      })
      .asPromise();
    for (const { collection, key, ...options } of [
      ...authIndexes,
      ...weddingIndexes,
      ...membershipIndexes,
      ...invitationIndexes,
      ...galleryIndexes,
      ...expenseIndexes,
      ...vendorIndexes,
    ])
      await connection.collection(collection).createIndex(key, options);
    admin = new Types.ObjectId();
    wedding = new Types.ObjectId();
    await connection.collection('users').insertOne({
      _id: admin,
      emailNormalized: 'http-admin@example.test',
      displayName: 'HTTP regression Admin',
      passwordHash: 'unused-fixture-hash',
      status: 'active',
      weddingId: wedding,
      role: 'admin',
      membershipVersion: 1,
    });
    await connection.collection('weddings').insertOne({
      _id: wedding,
      status: 'active',
      slug: 'http-regression',
      displayNames: { partnerOne: 'HTTP', partnerTwo: 'Regression' },
      weddingDate: '2027-03-14',
      defaultLocation: { name: 'Test venue' },
      timezone: 'Asia/Kolkata',
      createdBy: admin,
      membershipVersion: 0,
    });
    adminSecret = await session(admin);
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error();
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    base = `http://127.0.0.1:${port}`;
    server = fork(
      resolve('node_modules/next/dist/bin/next'),
      ['start', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        execArgv: [],
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          MONGODB_DB_NAME: database,
          APP_BASE_URL: origin,
          RESEND_API_KEY: '',
          RESEND_FROM_EMAIL: '',
          EMAIL_FROM: '',
          CRON_SECRET: '',
          TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
          TOKEN_ENCRYPTION_KEY_ID: 'http-invitations-v1',
          R2_ACCOUNT_ID: '',
          R2_ACCESS_KEY_ID: '',
          R2_SECRET_ACCESS_KEY: '',
          R2_BUCKET: '',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );
    // HTTPS origin + explicit cookie emulate TLS termination; socket traffic stays
    // loopback-only. Do not weaken production cookies or app configuration for tests.
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error();
      try {
        if (
          (
            await fetch(base + '/api/v1/auth/session', {
              signal: AbortSignal.timeout(1500),
            })
          ).ok
        )
          return;
      } catch {
        /* Server may not be listening yet. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error();
  } catch {
    throw new Error(
      'Isolated HTTP test setup failed. Build first and configure MongoDB; private details withheld.',
    );
  }
});
afterAll(async () => {
  try {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      const timer = setTimeout(() => server?.kill('SIGKILL'), 5000);
      try {
        server.kill('SIGTERM');
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    if (
      connection?.readyState === 1 &&
      connection.name === database &&
      /^sp_http_test_[a-f0-9]{24}$/.test(database)
    )
      await connection.dropDatabase();
  } catch {
    throw new Error(
      'Isolated HTTP test cleanup failed; private details withheld.',
    );
  } finally {
    await connection?.close();
    vi.unstubAllEnvs();
  }
});

describe('Guest invitation flow through the running Next.js HTTP server', () => {
  it('exchanges a fragment capability into a secure cookie, saves RSVP and blocks access after revocation', async () => {
    const eventId = new Types.ObjectId(),
      guestId = new Types.ObjectId();
    await connection!.collection('events').insertOne({
      _id: eventId,
      weddingId: wedding,
      title: 'HTTP private function',
      description: 'Test function',
      status: 'active',
      startsAt: new Date(Date.now() + 2 * 86400000),
      endsAt: new Date(Date.now() + 3 * 86400000),
      timezone: 'Asia/Kolkata',
      venue: { name: 'Test venue', address: 'Private address' },
      __v: 0,
    });
    await connection!.collection('guestContacts').insertOne({
      _id: guestId,
      weddingId: wedding,
      displayName: 'HTTP private guest',
      emailNormalized: 'http-private@example.test',
      phone: '12345',
      notes: 'Organizer only',
      archivedAt: null,
      selectedEventIds: [eventId],
      __v: 0,
    });
    const endpoint = `/api/v1/guest-contacts/${guestId}/invitation`;
    const createKey = randomUUID(),
      issueHeaders = {
        ...headers(adminSecret),
        'Content-Type': 'application/json',
        'Idempotency-Key': createKey,
      };
    const issue = await fetch(base + endpoint, {
      method: 'POST',
      headers: issueHeaders,
      body: JSON.stringify({ guestVersion: 0 }),
    });
    expect(issue.status).toBe(201);
    const issued = (await issue.json()).data;
    expect(issued.invitations).toHaveLength(1);
    const roster = await fetch(
      base + '/api/v1/events/' + eventId + '/invitations',
      { headers: headers(adminSecret) },
    );
    expect(roster.status).toBe(200);
    expect(roster.headers.get('Cache-Control')).toBe('no-store');
    expect((await roster.json()).data.rows[0]).toMatchObject({
      guestId: guestId.toString(),
      active: true,
      status: 'pending',
    });
    expect(
      (await fetch(base + '/api/v1/events/' + eventId + '/invitations')).status,
    ).toBe(401);
    expect(
      (
        await fetch(base + endpoint + '/remind', {
          method: 'POST',
          headers: { ...headers(adminSecret), 'X-CSRF-Token': '' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + endpoint + '/remind', {
          method: 'POST',
          headers: headers(adminSecret),
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + endpoint + '/remind', {
          method: 'POST',
          headers: { ...headers(adminSecret), 'If-Match': '' },
        })
      ).status,
    ).toBe(428);

    expect(
      (
        await fetch(base + endpoint, {
          method: 'POST',
          headers: issueHeaders,
          body: JSON.stringify({ guestVersion: 0 }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fetch(base + endpoint + '/share', {
          method: 'POST',
          headers: { ...headers(adminSecret), 'X-CSRF-Token': '' },
        })
      ).status,
    ).toBe(403);
    const shared = await fetch(base + endpoint + '/share', {
      method: 'POST',
      headers: headers(adminSecret),
    });
    expect(shared.status).toBe(200);
    const link = new URL((await shared.json()).data.link);
    expect(link.pathname).toBe('/invitation');
    expect(link.search).toBe('');
    const fragment = Object.fromEntries(
      new URLSearchParams(link.hash.slice(1)),
    );
    const exchange = await fetch(base + '/api/v1/guest/invitations/exchange', {
      method: 'POST',
      headers: { ...headers(adminSecret), 'Content-Type': 'application/json' },
      body: JSON.stringify(fragment),
    });
    expect(exchange.status).toBe(200);
    const cookieHeader = exchange.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-shaadipilot_guest='));
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=lax');
    expect(cookieHeader).not.toContain('Domain=');
    const guestCookie = cookieHeader!.split(';')[0];
    const hubResponse = await fetch(
      base + '/api/v1/guest/invitations/current',
      { headers: { Cookie: guestCookie } },
    );
    expect(hubResponse.status).toBe(200);
    expect(hubResponse.headers.get('Cache-Control')).toBe('no-store');
    const hub = (await hubResponse.json()).data,
      row = hub.invitations[0];
    expect(JSON.stringify(hub)).not.toContain('Organizer only');
    expect(JSON.stringify(hub)).not.toContain('http-private@example.test');
    const body = JSON.stringify({
      invitationId: row.id,
      status: 'attending',
      additionalGuests: 15,
    });
    const rsvpHeaders = {
      Origin: origin,
      Cookie: guestCookie,
      'Content-Type': 'application/json',
      'X-CSRF-Token': hub.csrfToken,
      'X-Guest-Context': hub.context,
      'If-Match': `"${row.version}"`,
    };
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/current/rsvp', {
          method: 'PUT',
          headers: { ...rsvpHeaders, 'X-CSRF-Token': '' },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/current/rsvp', {
          method: 'PUT',
          headers: {
            ...rsvpHeaders,
            'X-Guest-Context': new Types.ObjectId().toString(),
          },
          body,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/current/rsvp', {
          method: 'PUT',
          headers: { ...rsvpHeaders, 'If-Match': '' },
          body,
        })
      ).status,
    ).toBe(428);
    const saved = await fetch(base + '/api/v1/guest/invitations/current/rsvp', {
      method: 'PUT',
      headers: rsvpHeaders,
      body,
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.invitation.headcount).toBe('16');
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/current/rsvp', {
          method: 'PUT',
          headers: rsvpHeaders,
          body,
        })
      ).status,
    ).toBe(200);
    const account = await fetch(base + '/account', {
      headers: headers(adminSecret),
    });
    expect(account.status).toBe(200);
    expect(await account.text()).toContain('HTTP private function');
    const landing = await fetch(base + '/invitation');
    expect(landing.status).toBe(200);
    expect(landing.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(landing.headers.get('X-Robots-Tag')).toContain('noindex');
    const html = await landing.text();
    expect(html).not.toContain('HTTP private guest');
    expect(html).not.toContain(fragment.secret);
    const revoked = await fetch(base + endpoint + '/revoke', {
      method: 'POST',
      headers: {
        ...headers(adminSecret),
        'If-Match': `"${issued.link.version}"`,
      },
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/current', {
          headers: { Cookie: guestCookie },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(base + '/api/v1/guest/invitations/exchange', {
          method: 'POST',
          headers: {
            ...headers(adminSecret),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fragment),
        })
      ).status,
    ).toBe(401);
    expect(
      await connection!
        .collection('emailDeliveries')
        .countDocuments({ weddingId: wedding, kind: 'guest-invite' }),
    ).toBe(0);
  });
});
describe('Manager removal through the running Next.js HTTP server', () => {
  it('runs Guest contact create/replay/search/edit/archive through real Next HTTP', async () => {
    const fixture = await manager(),
      input = { displayName: 'HTTP guest', email: 'guest-http@example.test' },
      key = randomUUID();
    const writeHeaders = {
      ...headers(fixture.tokens[0]),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    };
    const path = base + '/api/v1/guest-contacts';
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers: { ...writeHeaders, 'X-CSRF-Token': 'invalid' },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(403);
    const create = await fetch(path, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(input),
    });
    expect(create.status).toBe(201);
    const row = (await create.json()).data.guest;
    const replay = await fetch(path, {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(input),
    });
    expect(replay.status).toBe(201);
    expect((await replay.json()).data.guest.id).toBe(row.id);
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers: { ...writeHeaders, 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ displayName: 'Missing email' }),
        })
      ).status,
    ).toBe(422);
    const second = await fetch(path, {
      method: 'POST',
      headers: { ...writeHeaders, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ ...input, displayName: 'Shared family mailbox' }),
    });
    expect(second.status).toBe(201);
    expect((await second.json()).data.guest.duplicateEmail).toBe(true);
    const list = await fetch(path + '?search=guest-http%40example.test', {
      headers: writeHeaders,
    });
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    // Both contacts match the shared email guest-http@example.test.
    expect((await list.json()).data.guests).toHaveLength(2);
    const page = await fetch(base + '/account/guests', {
      headers: writeHeaders,
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Guest Directory');
    expect(
      (await fetch(path + '?search=x&search=y', { headers: writeHeaders }))
        .status,
    ).toBe(400);
    const updated = await fetch(path + '/' + row.id, {
      method: 'PATCH',
      headers: { ...writeHeaders, 'If-Match': '"0"' },
      body: JSON.stringify({ notes: 'Updated by Manager' }),
    });
    expect(updated.status).toBe(200);
    expect(
      (
        await fetch(path + '/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await fetch(path + '/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"1"' },
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(path + '/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"1"' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await fetch(path + '/' + row.id, { headers: writeHeaders })).status,
    ).toBe(404);
  });
  it('enforces Tasks security and runs create/replay/edit/filter/archive over real HTTP', async () => {
    const input = {
      title: 'HTTP task',
      description: 'Confirm delivery',
      assignedToUserId: admin.toString(),
      dueAt: '2020-01-01T00:00:00Z',
    };
    const key = randomUUID();
    const writeHeaders = {
      ...headers(adminSecret),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    };
    expect(
      (
        await fetch(base + '/api/v1/tasks', {
          method: 'POST',
          headers: { ...writeHeaders, 'X-CSRF-Token': 'wrong' },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(403);
    const created = await fetch(base + '/api/v1/tasks', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    const row = (await created.json()).data.task;
    const replay = await fetch(base + '/api/v1/tasks', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(input),
    });
    expect(replay.status).toBe(201);
    expect((await replay.json()).data.task.id).toBe(row.id);
    const list = await fetch(base + '/api/v1/tasks?overdue=true', {
      headers: headers(adminSecret),
    });
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect(
      (await list.json()).data.tasks.some(
        (task: { id: string }) => task.id === row.id,
      ),
    ).toBe(true);
    expect(
      (
        await fetch(base + '/api/v1/tasks?status=todo&status=done', {
          headers: headers(adminSecret),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/v1/tasks?unexpected=yes', {
          headers: headers(adminSecret),
        })
      ).status,
    ).toBe(422);
    const updated = await fetch(base + '/api/v1/tasks/' + row.id, {
      method: 'PATCH',
      headers: { ...writeHeaders, 'If-Match': '"0"' },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.task.overdue).toBe(false);
    expect(
      (
        await fetch(base + '/api/v1/tasks/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await fetch(base + '/api/v1/tasks/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"1"' },
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/v1/tasks/' + row.id, {
          method: 'DELETE',
          headers: { ...writeHeaders, 'If-Match': '"1"' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await fetch(base + '/api/v1/tasks/' + row.id, { headers: writeHeaders }))
        .status,
    ).toBe(404);
    const fixture = await manager();
    const options = await fetch(base + '/api/v1/tasks/options', {
      headers: headers(fixture.tokens[0]),
    });
    expect(options.status).toBe(200);
    expect(
      (await options.json()).data.members.some(
        (m: { id: string }) => m.id === admin.toString(),
      ),
    ).toBe(true);
  });
  it('creates, edits and removes an unlinked function through Next HTTP', async () => {
    const input = {
      title: 'HTTP Sangeet',
      description: 'Runtime verification',
      startsAt: '2027-03-13T14:00:00Z',
      endsAt: '2027-03-13T20:00:00Z',
      timezone: 'Asia/Kolkata',
      venue: { name: 'Test ballroom', address: 'Test venue' },
    };
    const created = await fetch(base + '/api/v1/events', {
      method: 'POST',
      headers: {
        ...headers(adminSecret),
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    const row = (await created.json()).data.event;
    const changed = await fetch(base + '/api/v1/events/' + row.id, {
      method: 'PATCH',
      headers: {
        ...headers(adminSecret),
        'If-Match': '"0"',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...input, title: 'Updated Sangeet' }),
    });
    expect(changed.status).toBe(200);
    const stale = await fetch(base + '/api/v1/events/' + row.id, {
      method: 'DELETE',
      headers: { ...headers(adminSecret), 'If-Match': '"0"' },
    });
    expect(stale.status).toBe(412);
    const deleted = await fetch(base + '/api/v1/events/' + row.id, {
      method: 'DELETE',
      headers: { ...headers(adminSecret), 'If-Match': '"1"' },
    });
    expect(deleted.status).toBe(200);
    expect(
      (
        await fetch(base + '/api/v1/events/' + row.id, {
          headers: headers(adminSecret),
        })
      ).status,
    ).toBe(404);
  });
  it.each(['omitted', 'empty-string', 'empty-stream'] as const)(
    'accepts %s DELETE content and revokes membership, sessions and old invitations',
    async (framing) => {
      const fixture = await manager();
      const body =
        framing === 'omitted'
          ? undefined
          : framing === 'empty-string'
            ? ''
            : new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.close();
                },
              });
      const options = {
        method: 'DELETE',
        headers: headers(adminSecret),
        ...(body === undefined ? {} : { body }),
        ...(framing === 'empty-stream' ? { duplex: 'half' } : {}),
      };
      const response = await fetch(
        `${base}/api/v1/members/${fixture.id}`,
        options,
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({ removed: true });
      expect(
        await connection!.collection('users').findOne({ _id: fixture.id }),
      ).toMatchObject({ weddingId: null, role: null, membershipVersion: 2 });
      expect(
        await connection!
          .collection('sessions')
          .countDocuments({ userId: fixture.id, revokedAt: null }),
      ).toBe(0);
      expect(
        await connection!
          .collection('memberInvites')
          .findOne({ _id: fixture.inviteId }),
      ).toMatchObject({ state: 'revoked' });
      for (const token of fixture.tokens) {
        const denied = await fetch(base + '/api/v1/members', {
          headers: headers(token),
        });
        expect(denied.status).toBe(401);
      }
      const roster = await fetch(base + '/api/v1/members', {
        headers: headers(adminSecret),
      });
      expect(roster.status).toBe(200);
      expect(
        (await roster.json()).data.members.some(
          (row: { id: string }) => row.id === fixture.id.toString(),
        ),
      ).toBe(false);
    },
  );
  it.each(['{}', ' ', 'x'])(
    'rejects nonempty DELETE content %j without mutating the membership',
    async (body) => {
      const fixture = await manager();
      const response = await fetch(`${base}/api/v1/members/${fixture.id}`, {
        method: 'DELETE',
        headers: headers(adminSecret),
        body,
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_REQUEST');
      expect(
        await connection!.collection('users').findOne({ _id: fixture.id }),
      ).toMatchObject({
        weddingId: wedding,
        role: 'manager',
        membershipVersion: 1,
      });
      expect(
        await connection!
          .collection('sessions')
          .countDocuments({ userId: fixture.id, revokedAt: null }),
      ).toBe(2);
      expect(
        await connection!
          .collection('memberInvites')
          .findOne({ _id: fixture.inviteId }),
      ).toMatchObject({ state: 'accepted' });
    },
  );
});

describe('Private gallery through running Next HTTP', () => {
  it('protects metadata, rejects unsafe upload writes and accepts bodyless removal without contacting R2', async () => {
    const photo = new Types.ObjectId();
    await connection!.collection('photos').insertOne({
      _id: photo,
      weddingId: wedding,
      uploadedById: admin,
      name: 'HTTP private gallery fixture',
      mimeType: 'image/jpeg',
      expectedBytes: 100,
      sizeBytes: 90,
      state: 'ready',
      stagingKey: 'weddings/' + wedding + '/staging/' + photo,
      objectKey: 'weddings/' + wedding + '/photos/' + photo + '.webp',
      cleanupKeys: [],
      uploadUntil: new Date(0),
      expiresAt: new Date(0),
      cleanupAfter: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      __v: 0,
      width: 3,
      height: 2,
    });
    expect((await fetch(base + '/api/v1/gallery/photos')).status).toBe(401);
    const list = await fetch(base + '/api/v1/gallery/photos', {
      headers: headers(adminSecret),
    });
    expect(list.status).toBe(200);
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    const data = (await list.json()).data;
    expect(data.storageReady).toBe(false);
    expect(
      data.photos.find((p: { id: string }) => p.id === photo.toString()).name,
    ).toContain('HTTP private');
    expect(JSON.stringify(data)).not.toContain('objectKey');
    const body = JSON.stringify({
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
    });
    expect(
      (
        await fetch(base + '/api/v1/gallery/uploads', {
          method: 'POST',
          headers: {
            ...headers(adminSecret),
            'X-CSRF-Token': '',
            'Content-Type': 'application/json',
          },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + '/api/v1/gallery/uploads', {
          method: 'POST',
          headers: {
            ...headers(adminSecret),
            'Idempotency-Key': randomUUID(),
            'Content-Type': 'application/json',
          },
          body,
        })
      ).status,
    ).toBe(503);
    const removeHeaders = { ...headers(adminSecret), 'If-Match': '"0"' };
    expect(
      (
        await fetch(base + '/api/v1/gallery/photos/' + photo, {
          method: 'DELETE',
          headers: removeHeaders,
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/v1/gallery/photos/' + photo, {
          method: 'DELETE',
          headers: removeHeaders,
        })
      ).status,
    ).toBe(202);
    expect(
      (await connection!.collection('photos').findOne({ _id: photo }))!.state,
    ).toBe('deleting');
    expect(
      (
        await fetch(base + '/api/v1/gallery/photos/' + new Types.ObjectId(), {
          method: 'DELETE',
          headers: removeHeaders,
        })
      ).status,
    ).toBe(404);
  });
});

describe('Manual vendor directory through running Next HTTP', () => {
  it('enforces session/Origin/CSRF/context/versions and supports safe CRUD retries', async () => {
    const body = {
      name: 'HTTP Vendor [A]',
      category: 'Photography',
      website: 'https://example.test',
      notes: 'Private note',
    };
    const h = {
      ...headers(adminSecret),
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    };
    expect((await fetch(base + '/api/v1/vendors')).status).toBe(401);
    for (const extra of [
      { Origin: 'https://evil.test' },
      { 'X-CSRF-Token': '' },
    ]) {
      expect(
        (
          await fetch(base + '/api/v1/vendors', {
            method: 'POST',
            headers: { ...h, ...extra },
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await fetch(base + '/api/v1/vendors', {
          method: 'POST',
          headers: {
            ...h,
            'X-Wedding-Context': new Types.ObjectId().toString(),
          },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(base + '/api/v1/vendors', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ ...body, googlePlaceId: 'injected' }),
        })
      ).status,
    ).toBe(422);
    const create = await fetch(base + '/api/v1/vendors', {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    expect(create.status).toBe(201);
    const vendor = (await create.json()).data.vendor;
    const retry = await fetch(base + '/api/v1/vendors', {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    expect((await retry.json()).data.vendor.id).toBe(vendor.id);
    const list = await fetch(base + '/api/v1/vendors?search=%5BA%5D', {
      headers: h,
    });
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect((await list.json()).data.total).toBe(1);
    const { ['If-Match']: omitted, ...noMatch } = h;
    expect(omitted).toBeDefined();
    expect(
      (
        await fetch(base + '/api/v1/vendors/' + vendor.id, {
          method: 'PATCH',
          headers: noMatch,
          body: JSON.stringify({ notes: 'Changed' }),
        })
      ).status,
    ).toBe(428);
    expect(
      (
        await fetch(base + '/api/v1/vendors/' + vendor.id, {
          method: 'PATCH',
          headers: { ...h, 'If-Match': '"0"' },
          body: JSON.stringify({ notes: 'Changed' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + '/api/v1/vendors/' + vendor.id, {
          method: 'DELETE',
          headers: { ...h, 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await fetch(base + '/api/v1/vendors/' + vendor.id, {
          method: 'DELETE',
          headers: { ...h, 'If-Match': '"1"' },
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/v1/vendors/' + vendor.id, {
          method: 'DELETE',
          headers: { ...h, 'If-Match': '"1"' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await fetch(base + '/api/v1/vendors/' + vendor.id, { headers: h }))
        .status,
    ).toBe(404);
  });
});

describe('Expense ledger through running Next HTTP', () => {
  it('returns 422 for malformed paise strings on POST and PATCH', async () => {
    for (const amountMinor of ['abc', '1.5', '1e3', '0x10']) {
      for (const method of ['POST', 'PATCH']) {
        const response = await fetch(
          base +
            '/api/v1/expenses' +
            (method === 'PATCH' ? '/' + new Types.ObjectId() : ''),
          {
            method,
            headers: {
              ...headers(adminSecret),
              'Content-Type': 'application/json',
              'Idempotency-Key': randomUUID(),
            },
            body: JSON.stringify(
              method === 'POST'
                ? {
                    title: 'Invalid payment',
                    paidAt: '2027-03-14',
                    amountMinor,
                  }
                : { amountMinor },
            ),
          },
        );
        expect(response.status).toBe(422);
        expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
      }
    }
  });
  it('creates with a durable key, filters exact totals and enforces bodyless versioned edits/removal', async () => {
    const body = {
      title: 'HTTP paid expense',
      amountMinor: '9007199254740993',
      currency: 'INR',
      paidAt: '2027-03-14',
      category: 'HTTP ledger',
    };
    const writeHeaders = {
      ...headers(adminSecret),
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    };
    expect((await fetch(base + '/api/v1/expenses')).status).toBe(401);
    expect(
      (
        await fetch(base + '/api/v1/expenses', {
          method: 'POST',
          headers: { ...writeHeaders, 'X-CSRF-Token': '' },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(403);
    const create = await fetch(base + '/api/v1/expenses', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(body),
    });
    expect(create.status).toBe(201);
    const row = (await create.json()).data.expense;
    const replay = await fetch(base + '/api/v1/expenses', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify(body),
    });
    expect((await replay.json()).data.expense.id).toBe(row.id);
    const list = await fetch(base + '/api/v1/expenses?category=HTTP%20ledger', {
      headers: headers(adminSecret),
    });
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect((await list.json()).data.summary.amountMinor).toBe(body.amountMinor);
    expect(
      (
        await fetch(base + '/api/v1/expenses/' + row.id, {
          method: 'PATCH',
          headers: { ...writeHeaders, 'If-Match': '"0"' },
          body: JSON.stringify({ amountMinor: '29' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + '/api/v1/expenses/' + row.id, {
          method: 'DELETE',
          headers: { ...headers(adminSecret), 'If-Match': '"0"' },
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await fetch(base + '/api/v1/expenses/' + row.id, {
          method: 'DELETE',
          headers: { ...headers(adminSecret), 'If-Match': '"1"' },
          body: ' ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(base + '/api/v1/expenses/' + row.id, {
          method: 'DELETE',
          headers: { ...headers(adminSecret), 'If-Match': '"1"' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + '/api/v1/expenses/' + row.id, {
          headers: headers(adminSecret),
        })
      ).status,
    ).toBe(404);
  });
});
