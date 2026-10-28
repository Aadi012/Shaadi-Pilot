import 'server-only';
import { cookies } from 'next/headers';
import { timingSafeEqual, createHash } from 'node:crypto';
import { ApiError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { logRequest } from '@/lib/logging/logger.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import { RESET_REQUEST_MESSAGE } from './contracts';
import { cookieNames, currentSession } from './http.server';
import { clientAddress, requireOrigin, verifyCsrf } from './security.server';
import {
  requestPasswordReset,
  inspectPasswordReset,
  confirmPasswordReset,
  resetDeliveryEligible,
} from './recovery-service.server';
import { dispatchResetEmails } from '@/modules/email/service.server';
import { dispatchInvitationEmails } from '@/modules/email/service.server';
import { invitationEmailEligible } from '@/modules/memberships/service.server';
async function checkCsrf(request: Request) {
  requireOrigin(request);
  const current = await currentSession();
  const jar = await cookies();
  verifyCsrf(
    current?.token ?? jar.get(cookieNames().csrf)?.value,
    request.headers.get('X-CSRF-Token'),
  );
}
type Schedule = (callback: () => Promise<void>) => void;
export const resetRequestHandler = (schedule: Schedule) =>
  withApiHandler(
    '/api/v1/auth/password-reset/requests',
    async (request, _context, requestId) => {
      await checkCsrf(request);
      const id = await requestPasswordReset(
        await readJson(request),
        clientAddress(request),
      );
      schedule(async () => {
        if (!id) return;
        const startedAt = performance.now();
        try {
          await dispatchResetEmails(resetDeliveryEligible, { id, limit: 1 });
        } catch (error) {
          logRequest({
            requestId,
            method: 'POST',
            route: '/(email-dispatch)',
            status: 503,
            durationMs: Math.round(performance.now() - startedAt),
            errorDiagnostic: describeApiError(error),
          });
        }
      });
      return apiSuccess({ message: RESET_REQUEST_MESSAGE }, requestId, 202);
    },
  );
export const resetInspectHandler = withApiHandler(
  '/api/v1/auth/password-reset/validate',
  async (request, _context, requestId) => {
    await checkCsrf(request);
    return apiSuccess(
      {
        valid: await inspectPasswordReset(
          await readJson(request),
          clientAddress(request),
        ),
      },
      requestId,
    );
  },
);
export const resetConfirmHandler = withApiHandler(
  '/api/v1/auth/password-reset/confirm',
  async (request, _context, requestId) => {
    await checkCsrf(request);
    await confirmPasswordReset(await readJson(request), clientAddress(request));
    return apiSuccess({ reset: true }, requestId);
  },
);
export const emailCronHandler = withApiHandler(
  '/api/internal/cron/emails',
  async (request, _context, requestId) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new ApiError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Email processing is not configured.',
      });
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (
      !timingSafeEqual(
        hash(request.headers.get('Authorization') ?? ''),
        hash(`Bearer ${secret}`),
      )
    )
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Unauthorized.',
      });
    const resets = await dispatchResetEmails(resetDeliveryEligible, {
      limit: 2,
    });
    const invitations = await dispatchInvitationEmails(
      invitationEmailEligible,
      { limit: 3 },
    );
    return apiSuccess({ resets, invitations }, requestId);
  },
);
