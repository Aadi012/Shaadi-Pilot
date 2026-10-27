import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
import { authHandler, sessionHandler } from '@/modules/auth/http.server';
import { Session, User, RateLimit } from '@/modules/auth/models.server';
import { hashSecret } from '@/modules/auth/security.server';
import { findSession } from '@/modules/auth/repository.server';

const database = 'sp_rec_test_' + randomUUID().replaceAll('-', '').slice(0, 24);
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
  process.env.RESEND_API_KEY = 're_mock_only';
  process.env.RESEND_FROM_EMAIL = 'test@example.test';
  process.env.TOKEN_ENCRYPTION_KEY_ID = 'test-v1';
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.CRON_SECRET = 'c'.repeat(64);
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
      ...recoveryIndexes,
      ...emailIndexes,
    ])
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
      /^sp_rec_test_[a-f0-9]{24}$/.test(database)
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
import { recoveryIndexes } from '@/modules/auth/recovery-indexes';
import { emailIndexes } from '@/modules/email/indexes';
import { PasswordReset } from '@/modules/auth/recovery-repository.server';
import { hashPassword, newSecret } from '@/modules/auth/security.server';
import { resetDeliveryEligible } from '@/modules/auth/recovery-service.server';
import {
  resetRequestHandler,
  resetConfirmHandler,
  resetInspectHandler,
  emailCronHandler,
} from '@/modules/auth/recovery-http.server';
import { EmailDelivery, EmailBatch } from '@/modules/email/models.server';
import { dispatchResetEmails } from '@/modules/email/service.server';
import { decryptEmail } from '@/modules/email/crypto.server';
import * as emailRepository from '@/modules/email/repository.server';
import * as recoveryRepository from '@/modules/auth/recovery-repository.server';
const schedule = vi.fn();
const requestHandler = resetRequestHandler(schedule);
let sequence = 0;
const requestPath = '/api/v1/auth/password-reset/requests';
const confirmPath = '/api/v1/auth/password-reset/confirm';
beforeEach(async () => {
  await RateLimit.deleteMany({});
  schedule.mockClear();
  for (const key of Object.keys(jar)) delete jar[key];
  context.cookie = '';
});
async function account(status: 'active' | 'disabled' = 'active') {
  return User.create({
    emailNormalized: `recovery-${++sequence}@example.test`,
    displayName: 'Recovery test',
    passwordHash: await hashPassword(password),
    status,
    weddingId: null,
    role: null,
    lastLoginAt: null,
  });
}
async function request(email: string) {
  return call(requestHandler, requestPath, {
    csrf: (await bootstrap()).csrfToken,
    body: { email },
  });
}
async function queued(user: Awaited<ReturnType<typeof account>>) {
  const response = await request(user.emailNormalized);
  expect(response.status).toBe(202);
  const delivery = await EmailDelivery.findOne({ userId: user._id })
    .sort({ _id: -1 })
    .lean();
  const batch = await EmailBatch.findById(delivery!._id)
    .select('+encrypted')
    .lean();
  const payload = JSON.parse(
    decryptEmail(batch!.encrypted!, batch!._id.toString()),
  );
  const link = payload[0].text.match(/http[^\s]+/)![0];
  return {
    token: new URLSearchParams(new URL(link).hash.slice(1)).get('token')!,
    delivery: delivery!,
    batch: batch!,
    payload,
    link,
  };
}
async function confirm(
  token: string,
  newPassword = 'A new recovery passphrase!',
) {
  return call(resetConfirmHandler, confirmPath, {
    csrf: (await bootstrap()).csrfToken,
    body: { token, password: newPassword },
  });
}
async function sessionFor(userId: mongoose.Types.ObjectId) {
  const token = newSecret();
  const now = new Date();
  await Session.create({
    userId,
    tokenHash: hashSecret(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + 600000),
    absoluteExpiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  });
  return token;
}
describe('password recovery and durable platform email', () => {
  it('fails account-safely when delivery configuration is unavailable', async () => {
    const user = await account();
    const prior = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = '';
    try {
      for (const email of [user.emailNormalized, 'unconfigured@example.test'])
        expect((await request(email)).status).toBe(503);
      expect(await PasswordReset.countDocuments({ userId: user._id })).toBe(0);
    } finally {
      process.env.RESEND_API_KEY = prior;
    }
  });
  it('rolls password changes back if revoking recovery state fails', async () => {
    const user = await account();
    const job = await queued(user);
    const session = await sessionFor(user._id);
    const fail = vi
      .spyOn(recoveryRepository, 'invalidateRecovery')
      .mockRejectedValueOnce(new Error('private fixture error'));
    try {
      expect((await confirm(job.token)).status).toBe(500);
    } finally {
      fail.mockRestore();
    }
    expect((await User.findById(user._id).lean())!.credentialVersion).toBe(0);
    expect(
      (await PasswordReset.findOne({ userId: user._id }).lean())!.usedAt,
    ).toBeNull();
    expect(await findSession(session)).not.toBeNull();
  });
  it('stops repeatedly crashed leases after the attempt limit without calling the provider', async () => {
    const user = await account();
    const job = await queued(user);
    await EmailDelivery.updateOne(
      { _id: job.delivery._id },
      {
        $set: {
          state: 'leased',
          attempts: 5,
          leaseUntil: new Date(Date.now() - 1),
          leaseOwner: 'crashed-worker',
        },
      },
    );
    const send = vi.fn();
    expect(
      (
        await dispatchResetEmails(
          resetDeliveryEligible,
          { id: job.delivery._id.toString() },
          send,
        )
      ).failed,
    ).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await EmailBatch.findById(job.batch._id).select('+encrypted').lean())!
        .encrypted,
    ).toBeUndefined();
  });
  it('requires Origin and CSRF on all public recovery POSTs', async () => {
    const priorCount = await PasswordReset.countDocuments();
    for (const handler of [
      requestHandler,
      resetConfirmHandler,
      resetInspectHandler,
    ]) {
      expect((await call(handler, requestPath, { body: {} })).status).toBe(403);
      expect(
        (
          await call(handler, requestPath, {
            origin: 'https://evil.test',
            body: {},
          })
        ).status,
      ).toBe(403);
    }
    expect(await PasswordReset.countDocuments()).toBe(priorCount);
  });
  it('returns matching generic responses for active, disabled and unknown accounts', async () => {
    const user = await account();
    const disabled = await account('disabled');
    const responses = [];
    for (const email of [
      user.emailNormalized,
      disabled.emailNormalized,
      'unknown@example.test',
    ]) {
      const response = await request(email);
      expect(response.status).toBe(202);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      responses.push((await response.json()).data);
    }
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[1]).toEqual(responses[2]);
    expect(await PasswordReset.countDocuments({ userId: user._id })).toBe(1);
    expect(await PasswordReset.countDocuments({ userId: disabled._id })).toBe(
      0,
    );
    expect(schedule).toHaveBeenCalledTimes(3);
  });
  it('bounds requests and rejects injected destinations', async () => {
    const csrf = (await bootstrap()).csrfToken;
    expect(
      (
        await call(requestHandler, requestPath, {
          csrf,
          body: { email: 'test@example.test', returnUrl: 'https://evil.test' },
        })
      ).status,
    ).toBe(422);
    for (let i = 0; i < 3; i++)
      expect((await request('limited@example.test')).status).toBe(202);
    const response = await request('limited@example.test');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('900');
  });
  it('stores only hashed validation material and encrypted immutable email payloads', async () => {
    const user = await account();
    const job = await queued(user);
    const reset = await PasswordReset.findOne({ userId: user._id })
      .select('+tokenHash')
      .lean();
    expect(reset!.tokenHash).toBe(hashSecret(job.token));
    expect(reset!.expiresAt.getTime() - reset!.createdAt.getTime()).toBe(
      1800000,
    );
    const raw = await mongoose.connection
      .collection('emailBatches')
      .findOne({ _id: job.batch._id });
    expect(JSON.stringify(raw)).not.toContain(job.token);
    expect(JSON.stringify(raw)).not.toContain(user.emailNormalized);
    expect(job.link).toMatch(/^http:\/\/localhost:3000\/reset-password#token=/);
    expect(job.payload[0].to).toEqual([user.emailNormalized]);
  });
  it('rolls back tokens and delivery work together on enqueue failure', async () => {
    const user = await account();
    const fail = vi
      .spyOn(emailRepository, 'insertDelivery')
      .mockRejectedValueOnce(new Error('private fixture failure'));
    try {
      expect((await request(user.emailNormalized)).status).toBe(500);
      expect(await PasswordReset.countDocuments({ userId: user._id })).toBe(0);
      expect(await EmailDelivery.countDocuments({ userId: user._id })).toBe(0);
    } finally {
      fail.mockRestore();
    }
  });
  it('validates a link without consuming it or exposing account data', async () => {
    const user = await account();
    const job = await queued(user);
    const response = await call(
      resetInspectHandler,
      '/api/v1/auth/password-reset/validate',
      { csrf: (await bootstrap()).csrfToken, body: { token: job.token } },
    );
    expect((await response.json()).data).toEqual({ valid: true });
    expect(
      (await PasswordReset.findOne({ userId: user._id }).lean())!.usedAt,
    ).toBeNull();
  });
  it('resets the password, invalidates every prior token and revokes only the target user sessions', async () => {
    const user = await account();
    const other = await account();
    const first = await queued(user);
    const second = await queued(user);
    const tokens = [await sessionFor(user._id), await sessionFor(user._id)];
    const otherToken = await sessionFor(other._id);
    const response = await confirm(first.token);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(
      await Session.countDocuments({ userId: user._id, revokedAt: null }),
    ).toBe(0);
    for (const token of tokens) expect(await findSession(token)).toBeNull();
    expect(await findSession(otherToken)).not.toBeNull();
    expect((await confirm(second.token)).status).toBe(400);
    expect((await confirm(first.token)).status).toBe(400);
    const csrf = (await bootstrap()).csrfToken;
    expect(
      (
        await call(authHandler('login'), '/api/v1/auth/login', {
          csrf,
          body: { email: user.emailNormalized, password },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(authHandler('login'), '/api/v1/auth/login', {
          csrf,
          body: {
            email: user.emailNormalized,
            password: 'A new recovery passphrase!',
          },
        })
      ).status,
    ).toBe(200);
  });
  it('allows only one concurrent redemption', async () => {
    const user = await account();
    const job = await queued(user);
    const csrf = (await bootstrap()).csrfToken;
    const results = await Promise.all(
      [1, 2].map(() =>
        call(resetConfirmHandler, confirmPath, {
          csrf,
          body: { token: job.token, password: 'Concurrent reset phrase!' },
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    expect((await User.findById(user._id).lean())!.credentialVersion).toBe(1);
  });
  it('rejects expired and disabled-account tokens without relying on TTL cleanup', async () => {
    const user = await account();
    const job = await queued(user);
    await PasswordReset.updateOne(
      { userId: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    expect((await confirm(job.token)).status).toBe(400);
    const disabled = await account();
    const second = await queued(disabled);
    await User.updateOne(
      { _id: disabled._id },
      { $set: { status: 'disabled' } },
    );
    expect((await confirm(second.token)).status).toBe(400);
  });
  it('serializes overlapping processors and erases delivery ciphertext after submission', async () => {
    const user = await account();
    const job = await queued(user);
    const send = vi
      .fn()
      .mockResolvedValue({ kind: 'submitted', id: 'mock-message' });
    await Promise.all([
      dispatchResetEmails(
        resetDeliveryEligible,
        { id: job.delivery._id.toString() },
        send,
      ),
      dispatchResetEmails(
        resetDeliveryEligible,
        { id: job.delivery._id.toString() },
        send,
      ),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await EmailDelivery.findById(job.delivery._id).lean())!.state).toBe(
      'submitted',
    );
    expect(
      (await EmailBatch.findById(job.batch._id).select('+encrypted').lean())!
        .encrypted,
    ).toBeUndefined();
  });
  it('retries ambiguous outcomes with identical payload and key after lease expiry', async () => {
    const user = await account();
    const job = await queued(user);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'retry', category: 'provider_ambiguous' })
      .mockResolvedValueOnce({ kind: 'submitted', id: 'mock-retry' });
    await dispatchResetEmails(
      resetDeliveryEligible,
      { id: job.delivery._id.toString() },
      send,
    );
    await EmailDelivery.updateOne(
      { _id: job.delivery._id },
      {
        $set: {
          state: 'leased',
          leaseUntil: new Date(Date.now() - 1),
          leaseOwner: 'old-worker',
        },
      },
    );
    await dispatchResetEmails(
      resetDeliveryEligible,
      { id: job.delivery._id.toString() },
      send,
    );
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(
      (await EmailDelivery.findById(job.delivery._id).lean())!.attempts,
    ).toBe(2);
  });
  it('cancels consumed links before sending and clears payloads', async () => {
    const user = await account();
    const job = await queued(user);
    expect((await confirm(job.token)).status).toBe(200);
    const send = vi.fn();
    const outcome = await dispatchResetEmails(
      resetDeliveryEligible,
      { id: job.delivery._id.toString() },
      send,
    );
    expect(outcome.cancelled).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await EmailBatch.findById(job.batch._id).select('+encrypted').lean())!
        .encrypted,
    ).toBeUndefined();
  });
  it('does not let a stale lease owner finalize another worker claim', async () => {
    const user = await account();
    const job = await queued(user);
    const old = await emailRepository.claimDelivery(
      new Date(),
      job.delivery._id.toString(),
    );
    await EmailDelivery.updateOne(
      { _id: old!._id },
      { $set: { leaseUntil: new Date(Date.now() - 1) } },
    );
    const fresh = await emailRepository.claimDelivery(
      new Date(),
      job.delivery._id.toString(),
    );
    await emailRepository.finishDelivery(old!, 'submitted');
    expect(
      (await EmailDelivery.findById(job.delivery._id).lean())!.leaseOwner,
    ).toBe(fresh!.leaseOwner);
    expect(
      (await EmailBatch.findById(job.batch._id).select('+encrypted').lean())!
        .encrypted,
    ).toBeDefined();
  });
  it('denies cron requests without the configured bearer secret', async () => {
    const response = await emailCronHandler(
      new Request('http://localhost:3000/api/internal/cron/emails'),
      undefined,
    );
    expect(response.status).toBe(401);
  });
});
