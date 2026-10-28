import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { requireEmptyBody } from '@/lib/api/require-empty-body.server';
import { currentSession } from '@/modules/auth/http.server';
import { requireOrigin, verifyCsrf } from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { objectIdSchema } from '@/modules/memberships/contracts';
import { listEvents, readEvent, writeEvent } from './service.server';
type Context = { params: Promise<{ eventId?: string }> };
export function eventHandler(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  detail = false,
) {
  return withApiHandler<Context>(
    detail ? '/api/v1/events/[eventId]' : '/api/v1/events',
    async (request, context, requestId) => {
      const current = await currentSession(true);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const userId = current.user._id.toString();
      const id = detail ? (await context.params).eventId : undefined;
      if (method === 'GET')
        return apiSuccess(
          id
            ? { event: await readEvent(userId, id) }
            : await listEvents(
                userId,
                new URL(request.url).searchParams.get('cursor') ?? undefined,
              ),
          requestId,
        );
      requireOrigin(request);
      verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit('events-write:' + userId, 60);
      let version: number | undefined;
      if (id) {
        const match = request.headers.get('If-Match');
        if (!match)
          throw new ApiError({
            status: 428,
            code: 'PRECONDITION_REQUIRED',
            message: 'Load the current function first.',
          });
        if (
          !/^"(?:0|[1-9][0-9]*)"$/.test(match) ||
          !Number.isSafeInteger(Number(match.slice(1, -1)))
        )
          throw new ApiError({
            status: 400,
            code: 'INVALID_PRECONDITION',
            message: 'Invalid function version.',
          });
        version = Number(match.slice(1, -1));
      }
      if (method === 'DELETE') await requireEmptyBody(request);
      const event = await writeEvent(
        userId,
        objectIdSchema.parse(request.headers.get('X-Wedding-Context')),
        method === 'DELETE' ? undefined : await readJson(request),
        id,
        version,
        method === 'DELETE',
      );
      return apiSuccess({ event }, requestId, method === 'POST' ? 201 : 200);
    },
  );
}
