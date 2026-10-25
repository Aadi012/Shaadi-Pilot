import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ cookie: '' }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => {
    const values = new Map(
      context.cookie.split(';').map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index).trim(), part.slice(index + 1)];
      }),
    );
    return {
      get: (key: string) =>
        values.has(key) ? { value: values.get(key) } : undefined,
      has: (key: string) => values.has(key),
    };
  },
}));
import { authIndexes } from '@/modules/auth/indexes';
import {
  authHandler,
  logoutHandler,
  sessionHandler,
} from '@/modules/auth/http.server';
import { User } from '@/modules/auth/models.server';

const database = 'sp_wed_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
const jar: Record<string, string> = {};
const password = 'Isolated celebration test phrase!';
type Handler = (request: Request, context: unknown) => Promise<Response>;
async function call(
  handler: Handler,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    origin?: string;
    cookie?: string;
    key?: string;
  } = {},
) {
  const cookie =
    options.cookie ??
    Object.entries(jar)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  context.cookie = cookie;
  const headers: Record<string, string> = {
    Cookie: cookie,
    'Content-Type': 'application/json',
  };
  if (options.origin !== 'omit')
    headers.Origin = options.origin ?? 'http://localhost:3000';
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  if (options.key) headers['Idempotency-Key'] = options.key;
  const response = await handler(
    new Request('http://localhost:3000' + path, {
      method: options.method ?? 'POST',
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    }),
    undefined,
  );
  for (const value of response.headers.getSetCookie()) {
    const [pair] = value.split(';');
    const index = pair.indexOf('=');
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return response;
}
async function bootstrap() {
  const response = await call(sessionHandler, '/api/v1/auth/session', {
    method: 'GET',
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
beforeAll(async () => {
  const nodeEnvironment = process.env.NODE_ENV;
  vi.stubEnv('NODE_ENV', 'development');
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  vi.stubEnv('NODE_ENV', nodeEnvironment);
  process.env.MONGODB_DB_NAME = database;
  process.env.APP_BASE_URL = 'http://localhost:3000';
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
    ])
      await mongoose.connection
        .collection(collection)
        .createIndex(key, options);
    await mongoose.connection.db!.createCollection('weddingCreations');
  } catch {
    throw new Error(
      'Isolated MongoDB integration setup failed (connection details withheld).',
    );
  }
});
afterAll(async () => {
  try {
    if (
      mongoose.connection.readyState === 1 &&
      mongoose.connection.name === database &&
      /^sp_wed_test_[a-f0-9]{24}$/.test(database)
    )
      await mongoose.connection.dropDatabase();
  } catch {
    throw new Error(
      'Isolated authentication test cleanup failed (details withheld).',
    );
  } finally {
    await mongoose.disconnect();
  }
});

import { weddingIndexes } from '@/modules/weddings/indexes';
import { Wedding, WeddingCreation } from '@/modules/weddings/models.server';
import {
  createWeddingHandler,
  currentWeddingHandler,
  slugAvailabilityHandler,
} from '@/modules/weddings/http.server';
import { weddingOverview } from '@/modules/dashboard/service.server';
import * as authServices from '@/modules/auth/service.server';
const input = {
  displayNames: {
    partnerOne: 'Aarav',
    partnerTwo: 'अनन्या',
    intro: 'Our celebration',
  },
  weddingDate: '2027-03-14',
  location: 'Jaipur',
  timezone: 'Asia/Kolkata',
  slug: 'aarav-ananya-test',
};
const firstKey = randomUUID();
let firstCookie = '',
  firstCsrf = '',
  secondCookie = '',
  secondCsrf = '',
  firstId = '',
  secondId = '';
function cookieHeader() {
  return Object.entries(jar)
    .map(([key, value]) => key + '=' + value)
    .join('; ');
}
async function organizer(address: string) {
  for (const key of Object.keys(jar)) delete jar[key];
  const csrf = (await bootstrap()).csrfToken;
  expect(
    (
      await call(authHandler('register'), '/api/v1/auth/register', {
        csrf,
        body: { email: address, displayName: 'Wedding Test', password },
      })
    ).status,
  ).toBe(202);
  expect(
    (
      await call(authHandler('login'), '/api/v1/auth/login', {
        csrf,
        body: { email: address, password },
      })
    ).status,
  ).toBe(200);
  return {
    cookie: cookieHeader(),
    csrf: (await bootstrap()).csrfToken,
    userId: (await User.findOne({
      emailNormalized: address,
    }).lean())!._id.toString(),
  };
}
async function create(
  cookie: string,
  csrf: string,
  body: unknown,
  key: string = randomUUID(),
) {
  return call(createWeddingHandler, '/api/v1/weddings', {
    cookie,
    csrf,
    body,
    key,
  });
}
describe('wedding creation and tenant isolation', () => {
  it('requires authentication, trusted Origin and session-bound CSRF', async () => {
    expect(
      (
        await call(createWeddingHandler, '/api/v1/weddings', {
          body: input,
          key: firstKey,
        })
      ).status,
    ).toBe(401);
    const user = await organizer('first@example.test');
    firstCookie = user.cookie;
    firstCsrf = user.csrf;
    expect(
      (
        await call(createWeddingHandler, '/api/v1/weddings', {
          cookie: firstCookie,
          csrf: firstCsrf,
          origin: 'https://evil.test',
          body: input,
          key: firstKey,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(createWeddingHandler, '/api/v1/weddings', {
          cookie: firstCookie,
          body: input,
          key: firstKey,
        })
      ).status,
    ).toBe(403);
  });
  it('validates dates, fields, slug and the idempotency key before creating state', async () => {
    for (const body of [
      { ...input, role: 'admin' },
      { ...input, weddingDate: '2027-02-29' },
      { ...input, timezone: 'Invalid/Timezone' },
      { ...input, slug: 'UPPER' },
    ])
      expect((await create(firstCookie, firstCsrf, body)).status).toBe(422);
    expect(
      (await create(firstCookie, firstCsrf, input, 'bad-key')).status,
    ).toBe(422);
    expect(await Wedding.countDocuments()).toBe(0);
  });
  it('creates a private wedding and first Admin in a single transaction', async () => {
    const response = await create(firstCookie, firstCsrf, input, firstKey);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Location')).toBe('/api/v1/weddings/current');
    const data = (await response.json()).data.wedding;
    firstId = data.id;
    expect(data).toMatchObject({
      weddingDate: '2027-03-14',
      isPublished: false,
      timezone: 'Asia/Kolkata',
    });
    const user = await User.findOne({
      emailNormalized: 'first@example.test',
    }).lean();
    expect(user?.weddingId?.toString()).toBe(firstId);
    expect(user?.role).toBe('admin');
    expect((await weddingOverview(user!._id.toString()))?.counts).toEqual({
      functions: 0,
      tasks: 0,
      guests: 0,
      expenseRecords: 0,
    });
    expect(await WeddingCreation.countDocuments()).toBe(1);
  });
  it('replays identical requests and rejects key reuse with changed input', async () => {
    const replay = await create(firstCookie, firstCsrf, input, firstKey);
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.wedding.id).toBe(firstId);
    const changed = await create(
      firstCookie,
      firstCsrf,
      { ...input, location: 'Mumbai' },
      firstKey,
    );
    expect(changed.status).toBe(409);
    expect((await changed.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      (
        await create(firstCookie, firstCsrf, {
          ...input,
          slug: 'another-address',
        })
      ).status,
    ).toBe(409);
    expect(await Wedding.countDocuments()).toBe(1);
  });
  it('rejects slug collisions without attaching the other account', async () => {
    const user = await organizer('second@example.test');
    secondCookie = user.cookie;
    secondCsrf = user.csrf;
    const conflict = await create(secondCookie, secondCsrf, input);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe('SLUG_TAKEN');
    expect((await User.findById(user.userId).lean())?.weddingId).toBeNull();
    expect(await Wedding.countDocuments()).toBe(1);
    const availability = await call(
      slugAvailabilityHandler,
      '/api/v1/weddings/slug-availability?slug=' + input.slug,
      { cookie: secondCookie, method: 'GET' },
    );
    expect((await availability.json()).data.available).toBe(false);
    const response = await create(
      secondCookie,
      secondCsrf,
      { ...input, slug: 'second-wedding' },
      firstKey,
    );
    expect(response.status).toBe(201);
    secondId = (await response.json()).data.wedding.id;
  });
  it('derives wedding access from current membership, ignoring forged tenant identifiers', async () => {
    for (const [cookie, id] of [
      [firstCookie, firstId],
      [secondCookie, secondId],
    ]) {
      const response = await call(
        currentWeddingHandler,
        '/api/v1/weddings/current?weddingId=' +
          (id === firstId ? secondId : firstId),
        { cookie, method: 'GET' },
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data.wedding.id).toBe(id);
    }
  });
  it('scopes every dashboard count to the current wedding', async () => {
    const db = mongoose.connection;
    await db
      .collection('events')
      .insertMany([
        { weddingId: new mongoose.Types.ObjectId(firstId) },
        { weddingId: new mongoose.Types.ObjectId(secondId) },
        { weddingId: new mongoose.Types.ObjectId(secondId) },
      ]);
    await db.collection('tasks').insertMany([
      { weddingId: new mongoose.Types.ObjectId(firstId), status: 'done' },
      { weddingId: new mongoose.Types.ObjectId(secondId), status: 'todo' },
    ]);
    await db
      .collection('guestContacts')
      .insertOne({ weddingId: new mongoose.Types.ObjectId(secondId) });
    const user = await User.findOne({
      emailNormalized: 'first@example.test',
    }).lean();
    expect((await weddingOverview(user!._id.toString()))?.counts).toEqual({
      functions: 1,
      tasks: 0,
      guests: 0,
      expenseRecords: 0,
    });
  });
  it('allows only one wedding under competing requests for the same organizer', async () => {
    const user = await organizer('race@example.test');
    const responses = await Promise.all(
      ['race-wedding-one', 'race-wedding-two'].map((slug) =>
        create(user.cookie, user.csrf, { ...input, slug }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Wedding.countDocuments({ createdBy: user.userId })).toBe(1);
  });
  it('deduplicates simultaneous requests with the same key', async () => {
    const user = await organizer('same-key@example.test');
    const key = randomUUID();
    const responses = await Promise.all([
      create(
        user.cookie,
        user.csrf,
        { ...input, slug: 'same-key-wedding' },
        key,
      ),
      create(
        user.cookie,
        user.csrf,
        { ...input, slug: 'same-key-wedding' },
        key,
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await Wedding.countDocuments({ createdBy: user.userId })).toBe(1);
  });
  it('rolls back the wedding when attaching its first Admin fails', async () => {
    const user = await organizer('rollback@example.test');
    const failure = vi
      .spyOn(authServices, 'attachCreatedWedding')
      .mockRejectedValueOnce(new Error('private database detail'));
    try {
      const response = await create(user.cookie, user.csrf, {
        ...input,
        slug: 'rollback-wedding',
      });
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain(
        'private database detail',
      );
      expect(await Wedding.countDocuments({ slug: 'rollback-wedding' })).toBe(
        0,
      );
      expect((await User.findById(user.userId).lean())?.weddingId).toBeNull();
    } finally {
      failure.mockRestore();
    }
  });
  it('rechecks role and membership rather than caching them in a session', async () => {
    const user = await User.findOne({
      emailNormalized: 'first@example.test',
    }).lean();
    await User.updateOne({ _id: user!._id }, { $set: { role: 'manager' } });
    let response = await call(
      currentWeddingHandler,
      '/api/v1/weddings/current',
      { cookie: firstCookie, method: 'GET' },
    );
    expect((await response.json()).data.role).toBe('manager');
    await User.updateOne(
      { _id: user!._id },
      { $set: { weddingId: null, role: null } },
    );
    response = await call(currentWeddingHandler, '/api/v1/weddings/current', {
      cookie: firstCookie,
      method: 'GET',
    });
    expect((await response.json()).data).toBeNull();
  });
  it('denies a revoked session even when the caller retains its cookie', async () => {
    const response = await call(logoutHandler, '/api/v1/auth/logout', {
      cookie: secondCookie,
      csrf: secondCsrf,
    });
    expect(response.status).toBe(200);
    expect(
      (
        await call(currentWeddingHandler, '/api/v1/weddings/current', {
          cookie: secondCookie,
          method: 'GET',
        })
      ).status,
    ).toBe(401);
  });
});
