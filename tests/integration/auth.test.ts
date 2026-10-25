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
import { Session, User, RateLimit } from '@/modules/auth/models.server';
import {
  ABSOLUTE_MS,
  hashSecret,
  IDLE_MS,
} from '@/modules/auth/security.server';
import { consumeLimit, findSession } from '@/modules/auth/repository.server';
import * as authRepository from '@/modules/auth/repository.server';

const database =
  'sp_auth_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
const jar: Record<string, string> = {};
const password = 'Isolated celebration test phrase!';
const email = 'organizer@example.test';
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
    for (const { collection, key, ...options } of authIndexes)
      await mongoose.connection
        .collection(collection)
        .createIndex(key, options);
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
      /^sp_auth_test_[a-f0-9]{24}$/.test(database)
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
describe('MongoDB-backed auth boundary', () => {
  it('bootstraps anonymous CSRF without exposing a session secret', async () => {
    const data = await bootstrap();
    expect(data.user).toBeNull();
    expect(data.csrfToken).toHaveLength(64);
    expect(data.csrfToken).not.toBe(jar.shaadipilot_csrf);
  });
  it('rejects untrusted/missing origins and missing CSRF before writing', async () => {
    const csrf = (await bootstrap()).csrfToken;
    for (const origin of ['https://attacker.example', 'omit'])
      expect(
        (
          await call(authHandler('register'), '/api/v1/auth/register', {
            csrf,
            origin,
            body: {},
          })
        ).status,
      ).toBe(403);
    expect(
      (
        await call(authHandler('register'), '/api/v1/auth/register', {
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });
  it('rejects unknown fields, invalid inputs and oversized bodies', async () => {
    const csrf = (await bootstrap()).csrfToken;
    for (const body of [
      { email, password: 'short', displayName: 'Test' },
      { email, password, displayName: 'Test', role: 'admin' },
    ])
      expect(
        (
          await call(authHandler('register'), '/api/v1/auth/register', {
            csrf,
            body,
          })
        ).status,
      ).toBe(422);
    expect(
      (
        await call(authHandler('register'), '/api/v1/auth/register', {
          csrf,
          body: { displayName: 'x'.repeat(9000) },
        })
      ).status,
    ).toBe(413);
  });
  it('gives new and duplicate signup identical responses without creating sessions', async () => {
    const csrf = (await bootstrap()).csrfToken;
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        call(authHandler('register'), '/api/v1/auth/register', {
          csrf,
          body: {
            email: ' Organizer@Example.Test ',
            password,
            displayName: 'Test Organizer',
          },
        }),
      ),
    );
    const payloads = [];
    for (const response of responses) {
      expect(response.status).toBe(202);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.getSetCookie()).toEqual([]);
      payloads.push((await response.json()).data);
    }
    expect(payloads[0]).toEqual(payloads[1]);
    expect(JSON.stringify(payloads)).not.toMatch(
      /EMAIL_ALREADY_EXISTS|user|passwordHash|tokenHash/,
    );
    expect(await User.countDocuments()).toBe(1);
    expect(await Session.countDocuments()).toBe(0);
    const user = await User.findOne().select('+passwordHash').lean();
    expect(user).toMatchObject({
      emailNormalized: email,
      weddingId: null,
      role: null,
    });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    const originalHash = user?.passwordHash;
    const duplicate = await call(
      authHandler('register'),
      '/api/v1/auth/register',
      {
        csrf,
        body: {
          email,
          password: 'An attacker selected password!',
          displayName: 'Changed name',
        },
      },
    );
    expect(duplicate.status).toBe(202);
    expect((await duplicate.json()).data).toEqual(payloads[0]);
    expect(
      (await User.findOne().select('+passwordHash').lean())?.passwordHash ===
        originalHash,
    ).toBe(true);
    expect((await bootstrap()).user).toBeNull();
  });
  it('restores the session on a new request and binds CSRF to it', async () => {
    const csrf = (await bootstrap()).csrfToken;
    const login = await call(authHandler('login'), '/api/v1/auth/login', {
      csrf,
      body: { email, password },
    });
    expect(login.status).toBe(200);
    const data = await bootstrap();
    expect(data.user.email).toBe(email);
    expect(
      (
        await call(logoutHandler, '/api/v1/auth/logout', {
          csrf: '0'.repeat(64),
        })
      ).status,
    ).toBe(403);
    expect((await bootstrap()).user.email).toBe(email);
  });
  it('rejects idle and absolute expiry without waiting for TTL deletion', async () => {
    const token = jar.shaadipilot_session;
    const record = await Session.findOne({
      tokenHash: hashSecret(token),
    }).lean();
    const now = new Date();
    await Session.updateOne(
      { _id: record!._id },
      { $set: { expiresAt: new Date(now.getTime() + 1000) } },
    );
    expect(
      await findSession(token, new Date(now.getTime() + 1001), false),
    ).toBeNull();
    await Session.updateOne(
      { _id: record!._id },
      {
        $set: {
          expiresAt: new Date(now.getTime() + IDLE_MS),
          absoluteExpiresAt: new Date(now.getTime() + 1000),
        },
      },
    );
    expect(
      await findSession(token, new Date(now.getTime() + 1001), false),
    ).toBeNull();
    await Session.updateOne(
      { _id: record!._id },
      {
        $set: {
          expiresAt: new Date(now.getTime() + IDLE_MS),
          absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS),
          lastSeenAt: new Date(now.getTime() - 120000),
        },
      },
    );
    expect(await findSession(token)).not.toBeNull();
  });
  it('denies disabled accounts and returns the same invalid-login response', async () => {
    await User.updateOne(
      { emailNormalized: email },
      { $set: { status: 'disabled' } },
    );
    expect(await findSession(jar.shaadipilot_session)).toBeNull();
    const csrf = (await bootstrap()).csrfToken;
    const bodies = [];
    for (const candidate of [email, 'missing@example.test']) {
      const response = await call(authHandler('login'), '/api/v1/auth/login', {
        csrf,
        body: { email: candidate, password },
      });
      expect(response.status).toBe(401);
      bodies.push((await response.json()).error);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    await User.updateOne(
      { emailNormalized: email },
      { $set: { status: 'active' } },
    );
  });
  it('rotates the presented session and revokes logout server-side', async () => {
    let csrf = (await bootstrap()).csrfToken;
    expect(
      (
        await call(authHandler('login'), '/api/v1/auth/login', {
          csrf,
          body: { email, password },
        })
      ).status,
    ).toBe(200);
    const old = jar.shaadipilot_session;
    csrf = (await bootstrap()).csrfToken;
    expect(
      (
        await call(authHandler('login'), '/api/v1/auth/login', {
          csrf,
          body: { email, password },
        })
      ).status,
    ).toBe(200);
    expect(jar.shaadipilot_session).not.toBe(old);
    expect(await findSession(old)).toBeNull();
    const token = jar.shaadipilot_session;
    csrf = (await bootstrap()).csrfToken;
    expect(
      (await call(logoutHandler, '/api/v1/auth/logout', { csrf })).status,
    ).toBe(200);
    expect(await findSession(token)).toBeNull();
    expect((await bootstrap()).user).toBeNull();
  });
  it('enforces one atomic MongoDB rate bucket under concurrency', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => consumeLimit('test:race', 3)),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(
      3,
    );
    for (const item of results)
      if (item.status === 'rejected')
        expect(item.reason.code).toBe('RATE_LIMITED');
    expect(await RateLimit.countDocuments()).toBeGreaterThan(0);
  });
  it('preserves the old session when replacement session persistence fails', async () => {
    let csrf = (await bootstrap()).csrfToken;
    expect(
      (
        await call(authHandler('login'), '/api/v1/auth/login', {
          csrf,
          body: { email, password },
        })
      ).status,
    ).toBe(200);
    const token = jar.shaadipilot_session;
    csrf = (await bootstrap()).csrfToken;
    const failure = vi
      .spyOn(authRepository, 'createSession')
      .mockRejectedValueOnce(new Error('private provider detail'));
    try {
      const response = await call(authHandler('login'), '/api/v1/auth/login', {
        csrf,
        body: { email, password },
      });
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain(
        'private provider detail',
      );
      expect(await findSession(token)).not.toBeNull();
    } finally {
      failure.mockRestore();
    }
    csrf = (await bootstrap()).csrfToken;
    expect(
      (await call(logoutHandler, '/api/v1/auth/logout', { csrf })).status,
    ).toBe(200);
  });
  it('returns 429 and Retry-After once the account login limit is reached', async () => {
    const csrf = (await bootstrap()).csrfToken;
    for (let index = 0; index < 11; index++) {
      const response = await call(authHandler('login'), '/api/v1/auth/login', {
        csrf,
        body: { email: 'throttle@example.test', password },
      });
      expect(response.status).toBe(index < 10 ? 401 : 429);
      if (index === 10) expect(response.headers.get('Retry-After')).toBe('900');
    }
  });
  it('sets Secure host-only cookies for production authentication', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    const previousOrigin = process.env.APP_BASE_URL;
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_BASE_URL = 'https://shaadipilot.example';
    try {
      const response = await call(sessionHandler, '/api/v1/auth/session', {
        method: 'GET',
      });
      const { data } = await response.json();
      const signup = await call(
        authHandler('register'),
        '/api/v1/auth/register',
        {
          origin: 'https://shaadipilot.example',
          csrf: data.csrfToken,
          body: {
            displayName: 'Production policy test',
            email: 'secure-cookie@example.test',
            password,
          },
        },
      );
      expect(signup.status).toBe(202);
      expect(signup.headers.getSetCookie()).toEqual([]);
      const login = await call(authHandler('login'), '/api/v1/auth/login', {
        origin: 'https://shaadipilot.example',
        csrf: data.csrfToken,
        body: { email: 'secure-cookie@example.test', password },
      });
      expect(login.status).toBe(200);
      const cookie = login.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-shaadipilot_session='))!;
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toMatch(/Domain=/i);
    } finally {
      vi.stubEnv('NODE_ENV', previousEnvironment);
      process.env.APP_BASE_URL = previousOrigin;
    }
  });
});
