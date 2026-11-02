import 'server-only';
import { cookies } from 'next/headers';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { requireEmptyBody } from '@/lib/api/require-empty-body.server';
import { ApiError } from '@/lib/api/errors';
import { currentSession, cookieNames } from '@/modules/auth/http.server';
import {
  clientAddress,
  csrfToken,
  requireOrigin,
  verifyCsrf,
} from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { objectIdSchema } from '@/modules/memberships/contracts';
import {
  dispatchGuestEmails,
  dispatchGuestReminders,
} from '@/modules/email/service.server';
import { logRequest } from '@/lib/logging/logger.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import {
  organizerInvitation,
  changeInvitation,
  shareInvitation,
  exchangeInvitation,
  guestPrincipal,
  guestHub,
  saveRsvp,
  endGuestSession,
  guestEmailEligible,
  guestReminderEligible,
  functionRoster,
} from './service.server';
export const guestCookieName = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-shaadipilot_guest'
    : 'shaadipilot_guest';
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});
export { expectedVersion } from '@/lib/api/expected-version';
import { expectedVersion } from '@/lib/api/expected-version';

type Schedule = (fn: () => Promise<void>) => void;
type Context = { params: Promise<{ guestId: string }> };
export function organizerInvitationHandler(
  action: 'read' | 'issue' | 'rotate' | 'revoke' | 'send' | 'remind' | 'share',
  schedule?: Schedule,
) {
  return withApiHandler<Context>(
    '/api/v1/guest-contacts/[guestId]/invitation' +
      (['read', 'issue'].includes(action) ? '' : '/' + action),
    async (request, context, requestId) => {
      const current = await currentSession(true);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const userId = current.user._id.toString(),
        guestId = objectIdSchema.parse((await context.params).guestId);
      if (action === 'read')
        return apiSuccess(
          await organizerInvitation(userId, guestId),
          requestId,
        );
      requireOrigin(request);
      verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit('guest-invitation-write:' + userId, 40);
      const wedding = objectIdSchema.parse(
        request.headers.get('X-Wedding-Context'),
      );
      if (action !== 'issue' && action !== 'rotate')
        await requireEmptyBody(request);
      if (action === 'share')
        return apiSuccess(
          await shareInvitation(userId, wedding, guestId),
          requestId,
        );
      const result = await changeInvitation(
        userId,
        wedding,
        guestId,
        action,
        action === 'issue' || action === 'rotate'
          ? await readJson(request)
          : undefined,
        request.headers.get('Idempotency-Key') ?? undefined,
        action === 'revoke' ||
          action === 'rotate' ||
          action === 'send' ||
          action === 'remind'
          ? expectedVersion(request)
          : undefined,
      );
      if (result.deliveryId && schedule)
        schedule(async () => {
          try {
            await (
              action === 'remind' ? dispatchGuestReminders : dispatchGuestEmails
            )(
              action === 'remind' ? guestReminderEligible : guestEmailEligible,
              {
                id: result.deliveryId,
                limit: 1,
              },
            );
          } catch (error) {
            logRequest({
              requestId,
              method: 'POST',
              route: '/(guest-email-dispatch)',
              status: 503,
              durationMs: 0,
              errorDiagnostic: describeApiError(error),
            });
          }
        });
      return apiSuccess(
        result,
        requestId,
        action === 'send' || action === 'remind'
          ? 202
          : action === 'issue'
            ? 201
            : 200,
      );
    },
  );
}
export const guestExchangeHandler = withApiHandler(
  '/api/v1/guest/invitations/exchange',
  async (request, _context, requestId) => {
    requireOrigin(request);
    const current = await currentSession(),
      jar = await cookies();
    verifyCsrf(
      current?.token ?? jar.get(cookieNames().csrf)?.value,
      request.headers.get('X-CSRF-Token'),
    );
    await enforceIdentityLimit(
      'guest-exchange-network:' + clientAddress(request),
      60,
    );
    const result = await exchangeInvitation(await readJson(request));
    jar.set(guestCookieName(), result.token, {
      ...options(),
      expires: result.expiresAt,
    });
    return apiSuccess({ opened: true }, requestId);
  },
);
export function guestHandler(action: 'current' | 'rsvp' | 'logout') {
  return withApiHandler(
    '/api/v1/guest/invitations/' +
      (action === 'rsvp' ? 'current/rsvp' : action),
    async (request, _context, requestId) => {
      const jar = await cookies(),
        token = jar.get(guestCookieName())?.value;
      const principal = await guestPrincipal(token);
      if (action === 'current')
        return apiSuccess(
          { ...(await guestHub(token)), csrfToken: csrfToken(principal.token) },
          requestId,
        );
      requireOrigin(request);
      verifyCsrf(principal.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit(
        'guest-rsvp:' + principal.link._id.toString(),
        120,
      );
      if (action === 'logout') {
        await requireEmptyBody(request);
        await endGuestSession(token);
        jar.set(guestCookieName(), '', { ...options(), maxAge: 0 });
        return apiSuccess({ loggedOut: true }, requestId);
      }
      return apiSuccess(
        {
          invitation: await saveRsvp(
            token,
            request.headers.get('X-Guest-Context'),
            await readJson(request),
            expectedVersion(request),
          ),
        },
        requestId,
      );
    },
  );
}

export const functionRosterHandler = withApiHandler<{
  params: Promise<{ eventId: string }>;
}>(
  '/api/v1/events/[eventId]/invitations',
  async (request, context, requestId) => {
    const current = await currentSession(true);
    if (!current)
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Please log in.',
      });
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((k) => k !== 'cursor') ||
      query.getAll('cursor').length > 1
    )
      throw new ApiError({
        status: 400,
        code: 'INVALID_QUERY',
        message: 'Invalid roster query.',
      });
    return apiSuccess(
      await functionRoster(
        current.user._id.toString(),
        (await context.params).eventId,
        query.get('cursor') ?? undefined,
      ),
      requestId,
    );
  },
);
