import { ApiError } from './errors';
export function expectedVersion(request: Request) {
  const value = request.headers.get('If-Match');
  if (!value)
    throw new ApiError({
      status: 428,
      code: 'PRECONDITION_REQUIRED',
      message: 'Load the latest details before continuing.',
    });
  const n = Number(value.slice(1, -1));
  if (!/^"(?:0|[1-9][0-9]*)"$/.test(value) || !Number.isSafeInteger(n))
    throw new ApiError({
      status: 400,
      code: 'INVALID_PRECONDITION',
      message: 'Invalid version.',
    });
  return n;
}
