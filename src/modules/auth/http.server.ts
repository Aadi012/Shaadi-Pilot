import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { apiSuccess } from '@/lib/api/responses.server';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { findSession } from './repository.server';
import { authenticate, logout, organizerDto } from './service.server';
import { REGISTRATION_MESSAGE } from './contracts';
import {
  clientAddress,
  csrfToken,
  isSecret,
  newSecret,
  requireOrigin,
  verifyCsrf,
} from './security.server';

export const cookieNames = () => ({
  session:
    process.env.NODE_ENV === 'production'
      ? '__Host-shaadipilot_session'
      : 'shaadipilot_session',
  csrf:
    process.env.NODE_ENV === 'production'
      ? '__Host-shaadipilot_csrf'
      : 'shaadipilot_csrf',
});
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});
export async function currentSession(touch = false) {
  const token = (await cookies()).get(cookieNames().session)?.value;
  if (!isSecret(token)) return null;
  const found = await findSession(token, new Date(), touch);
  return found ? { ...found, token } : null;
}
async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new ApiError({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Use application/json.',
    });
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new ApiError({
            status: 413,
            code: 'FILE_TOO_LARGE',
            message: 'Request body is too large.',
          });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError({
      status: 400,
      code: 'MALFORMED_JSON',
      message: 'Request body must be valid JSON.',
    });
  }
}
export const sessionHandler = withApiHandler(
  '/api/v1/auth/session',
  async (_request, _context, requestId) => {
    const current = await currentSession(true);
    const jar = await cookies();
    const names = cookieNames();
    const existing = jar.get(names.csrf)?.value;
    const secret =
      current?.token ?? (isSecret(existing) ? existing : newSecret());
    const response = NextResponse.json({
      data: {
        user: current ? organizerDto(current.user) : null,
        csrfToken: csrfToken(secret),
      },
      meta: { requestId },
    });
    if (!current) {
      response.cookies.set(names.csrf, secret, {
        ...cookieOptions(),
        maxAge: 3600,
      });
      if (jar.has(names.session))
        response.cookies.set(names.session, '', {
          ...cookieOptions(),
          maxAge: 0,
        });
    }
    return response;
  },
);
export function authHandler(action: 'register' | 'login') {
  return withApiHandler(
    `/api/v1/auth/${action}`,
    async (request, _context, requestId) => {
      requireOrigin(request);
      const current = await currentSession();
      const jar = await cookies();
      const names = cookieNames();
      verifyCsrf(
        current?.token ?? jar.get(names.csrf)?.value,
        request.headers.get('X-CSRF-Token'),
      );
      const result = await authenticate(
        action,
        await readJson(request),
        clientAddress(request),
        current?.token,
      );
      if (action === 'register')
        return apiSuccess({ message: REGISTRATION_MESSAGE }, requestId, 202);
      if (!result) throw new Error('Missing login session');
      const response = NextResponse.json(
        { data: { user: result.user }, meta: { requestId } },
        { status: 200 },
      );
      response.cookies.set(names.session, result.token, {
        ...cookieOptions(),
        expires: result.absoluteExpiresAt,
      });
      response.cookies.set(names.csrf, '', { ...cookieOptions(), maxAge: 0 });
      return response;
    },
  );
}
export const logoutHandler = withApiHandler(
  '/api/v1/auth/logout',
  async (request, _context, requestId) => {
    requireOrigin(request);
    const current = await currentSession();
    if (!current)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
    await logout(current.token);
    const response = new NextResponse(
      apiSuccess({ loggedOut: true }, requestId).body,
    );
    response.cookies.set(cookieNames().session, '', {
      ...cookieOptions(),
      maxAge: 0,
    });
    response.cookies.set(cookieNames().csrf, '', {
      ...cookieOptions(),
      maxAge: 0,
    });
    response.headers.set('Content-Type', 'application/json');
    return response;
  },
);
