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

describe('Manager removal through the running Next.js HTTP server', () => {
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
      headers: { ...headers(adminSecret), 'Content-Type': 'application/json' },
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
