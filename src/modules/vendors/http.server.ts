import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { requireEmptyBody } from '@/lib/api/require-empty-body.server';
import { expectedVersion } from '@/lib/api/expected-version';
import { currentSession } from '@/modules/auth/http.server';
import { requireOrigin, verifyCsrf } from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { objectIdSchema } from '@/modules/memberships/contracts';
import { listVendors, readVendor, writeVendor } from './service.server';
type Context = { params: Promise<{ vendorId?: string }> };
export function vendorHandler(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  detail = false,
) {
  return withApiHandler<Context>(
    detail ? '/api/v1/vendors/[vendorId]' : '/api/v1/vendors',
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
        ? objectIdSchema.parse((await context.params).vendorId)
        : undefined;
      if (method === 'GET') {
        const params = new URL(request.url).searchParams;
        const keys = [...params.keys()];
        if (new Set(keys).size !== keys.length)
          throw new ApiError({
            status: 400,
            code: 'INVALID_QUERY',
            message: 'Invalid vendor filters.',
          });
        return apiSuccess(
          id
            ? await readVendor(userId, id)
            : await listVendors(userId, Object.fromEntries(params)),
          requestId,
        );
      }
      requireOrigin(request);
      verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit('vendors-write:' + userId, 60);
      const version = id ? expectedVersion(request) : undefined;
      if (method === 'DELETE') await requireEmptyBody(request);
      const vendor = await writeVendor(
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
      return apiSuccess(vendor, requestId, method === 'POST' ? 201 : 200);
    },
  );
}
