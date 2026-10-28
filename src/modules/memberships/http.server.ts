import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { readJson } from '@/lib/api/read-json.server';
import { requireEmptyBody } from '@/lib/api/require-empty-body.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { currentSession, cookieNames } from '@/modules/auth/http.server';
import {
  requireOrigin,
  verifyCsrf,
  clientAddress,
} from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { dispatchInvitationEmails } from '@/modules/email/service.server';
import { logRequest } from '@/lib/logging/logger.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import {
  createInvitation,
  revokeInvitation,
  members,
  invitations,
  invitationView,
  acceptInvitation,
  invitationEmailEligible,
  removeManager,
} from './service.server';
import {
  inviteContextSchema,
  acceptInviteSchema,
  objectIdSchema,
} from './contracts';
import {
  pendingInvitation,
  invitationCookieName,
  invitationCookieOptions,
} from './context.server';
async function mutation(request: Request) {
  requireOrigin(request);
  const current = await currentSession(true);
  verifyCsrf(
    current?.token ?? (await cookies()).get(cookieNames().csrf)?.value,
    request.headers.get('X-CSRF-Token'),
  );
  return current;
}
async function signedIn() {
  const current = await currentSession(true);
  if (!current)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  return current;
}
function cursor(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== 'cursor') ||
    params.getAll('cursor').length > 1
  )
    throw new ApiError({
      status: 400,
      code: 'INVALID_QUERY',
      message: 'Provide one page cursor.',
    });
  return params.has('cursor')
    ? objectIdSchema.parse(params.get('cursor'))
    : undefined;
}
export const removeManagerHandler = withApiHandler<{
  params: Promise<{ userId: string }>;
}>('/api/v1/members/[userId]', async (request, context, requestId) => {
  const current = await mutation(request);
  if (!current)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  await enforceIdentityLimit(`member-remove:${current.user._id}`, 30);
  const match = request.headers.get('If-Match');
  if (!match)
    throw new ApiError({
      status: 428,
      code: 'PRECONDITION_REQUIRED',
      message: 'Load and review the current membership before removing.',
    });
  if (
    !/^"(?:0|[1-9][0-9]*)"$/.test(match) ||
    !Number.isSafeInteger(Number(match.slice(1, -1)))
  )
    throw new ApiError({
      status: 400,
      code: 'INVALID_PRECONDITION',
      message: 'Provide a valid membership version.',
    });
  // Next's Node adapter can supply an empty stream for a bodyless DELETE.
  await requireEmptyBody(request);
  return apiSuccess(
    await removeManager(
      current.user._id.toString(),
      (await context.params).userId,
      objectIdSchema.parse(request.headers.get('X-Wedding-Context')),
      Number(match.slice(1, -1)),
    ),
    requestId,
  );
});
export const membersHandler = withApiHandler(
  '/api/v1/members',
  async (request, _context, requestId) => {
    const current = await signedIn();
    return apiSuccess(
      await members(current.user._id.toString(), cursor(request)),
      requestId,
    );
  },
);
export const invitationsHandler = withApiHandler(
  '/api/v1/member-invites',
  async (request, _context, requestId) => {
    const current = await signedIn();
    return apiSuccess(
      await invitations(current.user._id.toString(), cursor(request)),
      requestId,
    );
  },
);
export const createInvitationHandler = (
  schedule: (callback: () => Promise<void>) => void,
) =>
  withApiHandler(
    '/api/v1/member-invites',
    async (request, _context, requestId) => {
      const current = await mutation(request);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      await enforceIdentityLimit(
        `member-invite:create:${current.user._id}`,
        20,
      );
      const expected = objectIdSchema.parse(
        request.headers.get('X-Wedding-Context'),
      );
      const result = await createInvitation(
        current.user._id.toString(),
        await readJson(request),
        request.headers.get('Idempotency-Key'),
        expected,
      );
      if (result.deliveryId)
        schedule(async () => {
          const start = performance.now();
          try {
            await dispatchInvitationEmails(invitationEmailEligible, {
              id: result.deliveryId!,
              limit: 1,
            });
          } catch (error) {
            logRequest({
              requestId,
              method: 'POST',
              route: '/(invitation-dispatch)',
              status: 503,
              durationMs: Math.round(performance.now() - start),
              errorDiagnostic: describeApiError(error),
            });
          }
        });
      return apiSuccess(
        { invitation: result.invitation, created: result.created },
        requestId,
        result.created ? 202 : 200,
      );
    },
  );
export const revokeInvitationHandler = withApiHandler<{
  params: Promise<{ inviteId: string }>;
}>(
  '/api/v1/member-invites/[inviteId]/revoke',
  async (request, context, requestId) => {
    const current = await mutation(request);
    if (!current)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    await enforceIdentityLimit(`member-invite:revoke:${current.user._id}`, 30);
    const id = (await context.params).inviteId;
    return apiSuccess(
      {
        invitation: await revokeInvitation(
          current.user._id.toString(),
          id,
          objectIdSchema.parse(request.headers.get('X-Wedding-Context')),
        ),
      },
      requestId,
    );
  },
);
export const stageInvitationHandler = withApiHandler(
  '/api/v1/member-invites/context',
  async (request, _context, requestId) => {
    const current = await mutation(request);
    await enforceIdentityLimit(
      `member-invite:context:${clientAddress(request)}`,
      60,
    );
    const { token } = inviteContextSchema.parse(await readJson(request));
    await enforceIdentityLimit(`member-invite:token:${token}`, 20);
    const view = await invitationView(token, current?.user._id.toString());
    const response = NextResponse.json({ data: view, meta: { requestId } });
    response.cookies.set(
      invitationCookieName(),
      view.state === 'invalid' ? '' : token,
      {
        ...invitationCookieOptions(),
        ...(view.state === 'invalid' ? { maxAge: 0 } : {}),
      },
    );
    return response;
  },
);
export const invitationContextHandler = withApiHandler(
  '/api/v1/member-invites/context',
  async (request, _context, requestId) => {
    await enforceIdentityLimit(
      `member-invite:read:${clientAddress(request)}`,
      90,
    );
    const current = await currentSession(true);
    return apiSuccess(
      await invitationView(
        await pendingInvitation(),
        current?.user._id.toString(),
      ),
      requestId,
    );
  },
);
export const clearInvitationHandler = withApiHandler(
  '/api/v1/member-invites/context',
  async (request, _context, requestId) => {
    await mutation(request);
    const response = new NextResponse(
      apiSuccess({ cleared: true }, requestId).body,
      { headers: { 'Content-Type': 'application/json' } },
    );
    response.cookies.set(invitationCookieName(), '', {
      ...invitationCookieOptions(),
      maxAge: 0,
    });
    return response;
  },
);
export const acceptInvitationHandler = withApiHandler(
  '/api/v1/member-invites/accept',
  async (request, _context, requestId) => {
    const current = await mutation(request);
    if (!current)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    await enforceIdentityLimit(`member-invite:accept:${current.user._id}`, 20);
    if (
      request.headers.get('X-Organizer-Context') !== current.user._id.toString()
    )
      throw new ApiError({
        status: 409,
        code: 'INVITATION_CONTEXT_CHANGED',
        message: 'Your account changed. Review this invitation again.',
      });
    const { invitationId } = acceptInviteSchema.parse(await readJson(request));
    const result = await acceptInvitation(
      current.user._id.toString(),
      await pendingInvitation(),
      invitationId,
    );
    return apiSuccess(result, requestId);
  },
);
