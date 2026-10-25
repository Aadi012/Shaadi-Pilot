import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { apiSuccess } from '@/lib/api/responses.server';
import { readJson } from '@/lib/api/read-json.server';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { currentSession } from '@/modules/auth/http.server';
import { requireOrigin, verifyCsrf } from '@/modules/auth/security.server';
import { enforceIdentityLimit } from '@/modules/auth/service.server';
import {
  createWedding,
  currentWedding,
  weddingSlugAvailable,
} from './service.server';
import { slugSchema } from './contracts';
async function requireOrganizer() {
  const current = await currentSession(true);
  if (!current)
    throw new ApiError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please log in.',
    });
  return current;
}
export const createWeddingHandler = withApiHandler(
  '/api/v1/weddings',
  async (request, _context, requestId) => {
    requireOrigin(request);
    const current = await requireOrganizer();
    verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
    await enforceIdentityLimit(`wedding-create:${current.user._id}`, 20);
    const result = await createWedding(
      current.user._id.toString(),
      await readJson(request),
      request.headers.get('Idempotency-Key'),
    );
    const response = apiSuccess(
      { wedding: result.wedding },
      requestId,
      result.replayed ? 200 : 201,
    );
    response.headers.set('Location', '/api/v1/weddings/current');
    return response;
  },
);
export const currentWeddingHandler = withApiHandler(
  '/api/v1/weddings/current',
  async (_request, _context, requestId) => {
    const current = await requireOrganizer();
    return apiSuccess(
      await currentWedding(current.user._id.toString()),
      requestId,
    );
  },
);
export const slugAvailabilityHandler = withApiHandler(
  '/api/v1/weddings/slug-availability',
  async (request, _context, requestId) => {
    const current = await requireOrganizer();
    await enforceIdentityLimit(`wedding-slug:${current.user._id}`, 60);
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => key !== 'slug') ||
      params.getAll('slug').length !== 1
    )
      throw new ApiError({
        status: 400,
        code: 'INVALID_QUERY',
        message: 'Provide one wedding address.',
      });
    const slug = slugSchema.parse(params.get('slug'));
    return apiSuccess(
      {
        slug,
        available: await weddingSlugAvailable(
          current.user._id.toString(),
          slug,
        ),
      },
      requestId,
    );
  },
);
