import 'server-only';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';
import * as argon2 from 'argon2';
import { ApiError } from '@/lib/api/errors';
import { readAppEnvironment } from '@/lib/config/env.server';

export const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const newSecret = () => randomBytes(32).toString('hex');
export const isSecret = (value: string | undefined): value is string =>
  !!value && /^[a-f0-9]{64}$/.test(value);
export const hashSecret = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const csrfToken = (secret: string) =>
  createHmac('sha256', secret).update('shaadipilot:csrf:v1').digest('hex');
export function verifyCsrf(secret: string | undefined, token: string | null) {
  if (
    !isSecret(secret) ||
    !token ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !timingSafeEqual(
      Buffer.from(csrfToken(secret), 'hex'),
      Buffer.from(token, 'hex'),
    )
  ) {
    throw new ApiError({
      status: 403,
      code: 'CSRF_FAILED',
      message: 'Please refresh the page and try again.',
    });
  }
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  const canonical = new URL(readAppEnvironment().APP_BASE_URL);
  const allowed = new Set([canonical.origin]);
  if (
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1'].includes(canonical.hostname)
  ) {
    for (const host of ['localhost', '127.0.0.1'])
      allowed.add(
        `${canonical.protocol}//${host}${canonical.port ? ':' + canonical.port : ''}`,
      );
  }
  if (
    !origin ||
    !allowed.has(origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    throw new ApiError({
      status: 403,
      code: 'CSRF_FAILED',
      message: 'Request origin is not allowed.',
    });
  }
}
export function clientAddress(request: Request) {
  // Vercel overwrites this header. Never trust arbitrary forwarded headers locally.
  const address =
    process.env.VERCEL === '1'
      ? request.headers.get('x-vercel-forwarded-for')?.trim()
      : undefined;
  return address && isIP(address) ? address : 'shared-untrusted-network';
}
const options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
// Bound expensive work per function instance; MongoDB throttling also spans instances.
let active = 0;
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= 4)
    throw new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Please try again shortly.',
    });
  active++;
  try {
    return await operation();
  } finally {
    active--;
  }
}
export const hashPassword = (password: string) =>
  bounded(() => argon2.hash(password, options));
let dummy: Promise<string> | undefined;
export async function verifyPassword(
  hash: string | undefined,
  password: string,
) {
  const verifier =
    hash ??
    (await (dummy ??= hashPassword(newSecret()).catch((error: unknown) => {
      dummy = undefined;
      throw error;
    })));
  const valid = await bounded(() => argon2.verify(verifier, password));
  return !!hash && valid;
}
