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
import { listTasks, readTask, writeTask, taskOptions } from './service.server';
type Context = { params: Promise<{ taskId?: string }> };
export function taskHandler(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  detail = false,
  options = false,
) {
  return withApiHandler<Context>(
    options
      ? '/api/v1/tasks/options'
      : detail
        ? '/api/v1/tasks/[taskId]'
        : '/api/v1/tasks',
    async (request, context, requestId) => {
      const current = await currentSession(true);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const userId = current.user._id.toString();
      const id = detail
        ? objectIdSchema.parse((await context.params).taskId)
        : undefined;
      if (method === 'GET') {
        const params = new URL(request.url).searchParams;
        const keys = [...params.keys()];
        if (
          new Set(keys).size !== keys.length ||
          (options && keys.some((k) => k !== 'cursor'))
        )
          throw new ApiError({
            status: 400,
            code: 'INVALID_QUERY',
            message: 'Invalid task filters.',
          });
        return apiSuccess(
          options
            ? await taskOptions(userId, params.get('cursor') ?? undefined)
            : id
              ? await readTask(userId, id)
              : await listTasks(userId, Object.fromEntries(params)),
          requestId,
        );
      }
      requireOrigin(request);
      verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit('tasks-write:' + userId, 60);
      let version;
      if (id) {
        const match = request.headers.get('If-Match');
        if (!match)
          throw new ApiError({
            status: 428,
            code: 'PRECONDITION_REQUIRED',
            message: 'Load the current task first.',
          });
        if (
          !/^"(?:0|[1-9][0-9]*)"$/.test(match) ||
          !Number.isSafeInteger(Number(match.slice(1, -1)))
        )
          throw new ApiError({
            status: 400,
            code: 'INVALID_PRECONDITION',
            message: 'Invalid task version.',
          });
        version = Number(match.slice(1, -1));
      }
      if (method === 'DELETE') await requireEmptyBody(request);
      const task = await writeTask(
        userId,
        objectIdSchema.parse(request.headers.get('X-Wedding-Context')),
        method === 'DELETE' ? undefined : await readJson(request),
        {
          id,
          version,
          archive: method === 'DELETE',
          key: request.headers.get('Idempotency-Key') ?? undefined,
        },
      );
      return apiSuccess({ task }, requestId, method === 'POST' ? 201 : 200);
    },
  );
}
