import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('server-only', () => ({}));
import { emailEnvironment } from '@/modules/email/config.server';
import { encryptEmail, decryptEmail } from '@/modules/email/crypto.server';
import { sendResendBatch } from '@/modules/email/provider.server';
import {
  resetConfirmSchema,
  resetRequestSchema,
} from '@/modules/auth/contracts';
import { RecoveryForm } from '@/components/auth/recovery-form';
const environment = {
  NODE_ENV: 'test',
  RESEND_API_KEY: 're_test_only',
  RESEND_FROM_EMAIL: 'ShaadiPilot <test@example.test>',
  TOKEN_ENCRYPTION_KEY_ID: 'test-v1',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  APP_BASE_URL: 'http://localhost:3000',
};
function configure() {
  for (const [name, value] of Object.entries(environment))
    vi.stubEnv(name, value);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('recovery contracts and privacy', () => {
  it('normalizes email and rejects extra recovery fields', () => {
    expect(resetRequestSchema.parse({ email: ' A@EXAMPLE.TEST ' })).toEqual({
      email: 'a@example.test',
    });
    expect(
      resetRequestSchema.safeParse({
        email: 'a@example.test',
        returnUrl: 'https://evil.test',
      }).success,
    ).toBe(false);
    expect(
      resetConfirmSchema.safeParse({
        token: 'a'.repeat(64),
        password: 'a'.repeat(14),
      }).success,
    ).toBe(false);
    expect(
      resetConfirmSchema.safeParse({
        token: 'a'.repeat(64),
        password: '🙂'.repeat(15),
      }).success,
    ).toBe(true);
  });
  it('validates email configuration without exposing invalid values', () => {
    expect(emailEnvironment(environment).key).toHaveLength(32);
    for (const key of [
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'TOKEN_ENCRYPTION_KEY',
      'TOKEN_ENCRYPTION_KEY_ID',
    ]) {
      expect(() =>
        emailEnvironment({ ...environment, [key]: 'invalid sensitive value' }),
      ).toThrow(key);
    }
    expect(() =>
      emailEnvironment({
        ...environment,
        RESEND_FROM_EMAIL: 'test@example.test\r\nBcc:other@example.test',
      }),
    ).toThrow('RESEND_FROM_EMAIL');
  });
  it('encrypts queued payloads and rejects tampering, wrong identity and wrong keys', () => {
    configure();
    const encrypted = encryptEmail('private synthetic reset content', 'job-a');
    expect(JSON.stringify(encrypted)).not.toContain('private synthetic');
    expect(decryptEmail(encrypted, 'job-a')).toBe(
      'private synthetic reset content',
    );
    expect(() => decryptEmail(encrypted, 'job-b')).toThrow();
    expect(() =>
      decryptEmail(
        { ...encrypted, tag: randomBytes(16).toString('base64') },
        'job-a',
      ),
    ).toThrow();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    expect(() => decryptEmail(encrypted, 'job-a')).toThrow();
  });
  it('disables native credential submission before hydration and never renders a token', () => {
    const html = renderToStaticMarkup(
      createElement(RecoveryForm, { mode: 'request' }),
    );
    expect(html).toMatch(/<fieldset\b[^>]*disabled=/);
    expect(html).not.toContain('name="token"');
    expect(html).not.toContain('An account already');
    const reset = renderToStaticMarkup(
      createElement(RecoveryForm, { mode: 'reset' }),
    );
    expect(reset).toContain('Checking your reset link');
    expect(reset).not.toContain('name="password"');
  });
});
describe('Resend adapter', () => {
  it('passes immutable payload and idempotency identity without redirects', async () => {
    configure();
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ id: 'provider-id' }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await sendResendBatch('[{"test":true}]', 'stable-key')).toEqual({
      kind: 'submitted',
      id: 'provider-id',
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      body: '[{"test":true}]',
      redirect: 'error',
      headers: { 'Idempotency-Key': 'stable-key' },
    });
  });
  it('classifies transient, rejected and conflicting outcomes without provider details', async () => {
    configure();
    for (const [status, kind] of [
      [429, 'retry'],
      [503, 'retry'],
      [422, 'failed'],
      [409, 'quarantined'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('private provider details', { status }),
          ),
      );
      const result = await sendResendBatch('[]', 'key');
      expect(result.kind).toBe(kind);
      expect(JSON.stringify(result)).not.toContain('private');
    }
  });
  it('treats timeout and malformed acknowledgement as ambiguous retries', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('sensitive URL')),
    );
    expect(await sendResendBatch('[]', 'key')).toEqual({
      kind: 'retry',
      category: 'provider_ambiguous',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [] })),
    );
    expect((await sendResendBatch('[]', 'key')).kind).toBe('retry');
  });
});
