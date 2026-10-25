import 'server-only';
import { ApiError } from '@/lib/api/errors';
export async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new ApiError({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Use application/json.',
    });
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new ApiError({
            status: 413,
            code: 'FILE_TOO_LARGE',
            message: 'Request body is too large.',
          });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError({
      status: 400,
      code: 'MALFORMED_JSON',
      message: 'Request body must be valid JSON.',
    });
  }
}
