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
import { expectedVersion } from '@/lib/api/expected-version';
import {
  listPhotos,
  createUpload,
  completeUpload,
  removePhoto,
  photoView,
  cleanupPhotos,
} from './service.server';
import { createHash, timingSafeEqual } from 'node:crypto';
type Context = { params: Promise<{ photoId?: string }> };
export function galleryHandler(
  action: 'list' | 'intent' | 'complete' | 'remove' | 'view',
) {
  return withApiHandler<Context>(
    '/api/v1/gallery/' +
      {
        list: 'photos',
        intent: 'uploads',
        complete: 'uploads/[photoId]/complete',
        remove: 'photos/[photoId]',
        view: 'photos/[photoId]/view',
      }[action],
    async (request, context, requestId) => {
      const current = await currentSession(true);
      if (!current)
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Please log in.',
        });
      const userId = current.user._id.toString();
      if (action === 'list') {
        const query = new URL(request.url).searchParams;
        if (
          [...query.keys()].some((k) => k !== 'cursor') ||
          query.getAll('cursor').length > 1
        )
          throw new ApiError({
            status: 400,
            code: 'INVALID_QUERY',
            message: 'Invalid gallery query.',
          });
        return apiSuccess(
          await listPhotos(userId, Object.fromEntries(query)),
          requestId,
        );
      }
      if (action === 'view')
        return apiSuccess(
          await photoView(
            userId,
            objectIdSchema.parse((await context.params).photoId),
          ),
          requestId,
        );
      requireOrigin(request);
      verifyCsrf(current.token, request.headers.get('X-CSRF-Token'));
      await enforceIdentityLimit('gallery-write:' + userId, 60);
      const wedding = objectIdSchema.parse(
        request.headers.get('X-Wedding-Context'),
      );
      if (action === 'intent')
        return apiSuccess(
          await createUpload(
            userId,
            wedding,
            await readJson(request),
            request.headers.get('Idempotency-Key') ?? undefined,
          ),
          requestId,
          201,
        );
      await requireEmptyBody(request);
      const id = objectIdSchema.parse((await context.params).photoId);
      return apiSuccess(
        action === 'complete'
          ? await completeUpload(userId, wedding, id)
          : await removePhoto(userId, wedding, id, expectedVersion(request)),
        requestId,
        action === 'remove' ? 202 : 200,
      );
    },
  );
}
export const galleryCleanupHandler = withApiHandler(
  '/api/internal/cron/photos',
  async (request, _context, requestId) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new ApiError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Photo cleanup is not configured.',
      });
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (
      !timingSafeEqual(
        hash(request.headers.get('Authorization') ?? ''),
        hash('Bearer ' + secret),
      )
    )
      throw new ApiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Unauthorized.',
      });
    return apiSuccess(await cleanupPhotos(), requestId);
  },
);
