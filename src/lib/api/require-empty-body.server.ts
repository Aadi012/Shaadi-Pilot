import 'server-only';
import { ApiError } from '@/lib/api/errors';

export async function requireEmptyBody(request: Request): Promise<void> {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.byteLength > 0) {
        // Reject on the first payload bytes; never buffer an arbitrary body.
        await reader.cancel().catch(() => {});
        throw new ApiError({
          status: 400,
          code: 'INVALID_REQUEST',
          message: 'This operation does not accept a request body.',
        });
      }
    }
  } finally {
    reader.releaseLock();
  }
}
