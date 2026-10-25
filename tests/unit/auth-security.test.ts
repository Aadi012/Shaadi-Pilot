import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { loginSchema, registerSchema } from '@/modules/auth/contracts';
import {
  clientAddress,
  csrfToken,
  hashPassword,
  hashSecret,
  newSecret,
  requireOrigin,
  verifyCsrf,
  verifyPassword,
} from '@/modules/auth/security.server';
import { cookieNames } from '@/modules/auth/http.server';

afterEach(() => {
  vi.unstubAllEnvs();
});
describe('authentication security policies', () => {
  it('normalizes email and names but preserves passwords exactly', () => {
    const password = '  meaningful passphrase  ';
    expect(
      registerSchema.parse({
        displayName: '  अनन्या  ',
        email: ' A@Example.Test ',
        password,
      }),
    ).toEqual({ displayName: 'अनन्या', email: 'a@example.test', password });
    expect(
      registerSchema.safeParse({
        displayName: 'A',
        email: 'a@example.test',
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@example.test', password: 'short' })
        .success,
    ).toBe(true);
  });
  it('rejects injected tenancy and role fields', () => {
    expect(
      registerSchema.safeParse({
        displayName: 'A',
        email: 'a@example.test',
        password: 'A long passphrase!',
        weddingId: 'foreign',
        role: 'admin',
      }).success,
    ).toBe(false);
  });
  it('uses independent random secrets, one-way lookup hashes and session-bound CSRF', () => {
    const secret = newSecret();
    const other = newSecret();
    expect(secret === other).toBe(false);
    expect(hashSecret(secret) === secret).toBe(false);
    expect(() => verifyCsrf(secret, csrfToken(secret))).not.toThrow();
    for (const token of [null, '', csrfToken(other), 'z'.repeat(64)])
      expect(() => verifyCsrf(secret, token)).toThrow();
    expect(() => verifyCsrf(undefined, csrfToken(secret))).toThrow();
  });
  it('hashes and verifies using Argon2id without password trimming', async () => {
    const hash = await hashPassword(' a memorable test password ');
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hash.split('$')[3].split(',').sort()).toEqual([
      'm=19456',
      'p=1',
      't=2',
    ]);
    expect(await verifyPassword(hash, ' a memorable test password ')).toBe(
      true,
    );
    expect(await verifyPassword(hash, 'a memorable test password')).toBe(false);
    expect(await verifyPassword(undefined, 'a memorable test password')).toBe(
      false,
    );
  });
  it('accepts configured origins and local aliases, never arbitrary hosts', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    expect(() =>
      requireOrigin(
        new Request('http://evil.test', {
          headers: { Origin: 'http://127.0.0.1:3000' },
        }),
      ),
    ).not.toThrow();
    for (const origin of ['http://localhost:3001', 'https://evil.test', 'null'])
      expect(() =>
        requireOrigin(
          new Request('http://localhost:3000', { headers: { Origin: origin } }),
        ),
      ).toThrow();
    expect(() => requireOrigin(new Request('http://localhost:3000'))).toThrow();
  });
  it('uses host-prefixed cookies and exact HTTPS origins in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_BASE_URL', 'https://shaadipilot.example');
    expect(cookieNames().session).toBe('__Host-shaadipilot_session');
    expect(() =>
      requireOrigin(
        new Request('https://shaadipilot.example', {
          headers: { Origin: 'http://localhost:3000' },
        }),
      ),
    ).toThrow();
  });
  it('ignores spoofed proxy headers outside Vercel', () => {
    vi.stubEnv('VERCEL', '');
    expect(
      clientAddress(
        new Request('http://localhost', {
          headers: {
            'x-forwarded-for': '1.2.3.4',
            'x-vercel-forwarded-for': '1.2.3.4',
          },
        }),
      ),
    ).toBe('shared-untrusted-network');
    vi.stubEnv('VERCEL', '1');
    expect(
      clientAddress(
        new Request('http://localhost', {
          headers: { 'x-vercel-forwarded-for': '1.2.3.4' },
        }),
      ),
    ).toBe('1.2.3.4');
  });
});
