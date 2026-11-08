import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { currentSession } from '@/modules/auth/http.server';
import { requireOrigin, verifyCsrf } from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import { objectIdSchema } from '@/modules/memberships/contracts';
import {
  discoverVendors,
  savedPlaceDetails,
  saveGoogleVendor,
} from './discovery.server';
type Context = { params: Promise<{ vendorId?: string }> };
export function discoveryHandler(action: 'search' | 'save' | 'details') {
  return withApiHandler<Context>(
    '/api/v1/vendors/' +
      { search: 'discover', save: 'from-google', details: '[vendorId]/google' }[
        action
      ],
    async (request, context, requestId) => {
      const current = await currentSession(true);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const userId = current.user._id.toString();
      const expected = objectIdSchema.parse(
        request.headers.get('X-Wedding-Context'),
      );
      if (action === 'save') {
        requireOrigin(request);
        verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
        await enforceIdentityLimit('vendors-write:' + userId, 60);
        return apiSuccess(
          await saveGoogleVendor(
            userId,
            expected,
            await readJson(request),
            request.headers.get('Idempotency-Key'),
          ),
          requestId,
          201,
        );
      }
      const query = new URL(request.url).searchParams;
      if (
        new Set(query.keys()).size !== [...query.keys()].length ||
        (action === 'details' && query.size)
      )
        throw new ApiError({
          status: 400,
          code: 'INVALID_QUERY',
          message: 'Invalid discovery query.',
        });
      return apiSuccess(
        action === 'search'
          ? await discoverVendors(userId, expected, Object.fromEntries(query))
          : await savedPlaceDetails(
              userId,
              expected,
              objectIdSchema.parse((await context.params).vendorId),
            ),
        requestId,
      );
    },
  );
}
