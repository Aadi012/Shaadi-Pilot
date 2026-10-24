import 'server-only';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api/errors';

export function apiSuccess<T>(
  data: T,
  requestId: string,
  status: 200 | 201 | 202 = 200,
): Response {
  return Response.json(
    { data, meta: { requestId } },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
}

export function apiErrorResponse(error: unknown, requestId: string): Response {
  let publicError: ApiError;

  if (error instanceof ApiError) {
    publicError = error;
  } else if (error instanceof ZodError) {
    publicError = new ApiError({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Request failed validation',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        reason: 'Invalid value',
      })),
    });
  } else {
    publicError = new ApiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }

  return Response.json(
    {
      error: {
        code: publicError.code,
        message: publicError.message,
        ...(publicError.details ? { details: publicError.details } : {}),
      },
      meta: { requestId },
    },
    {
      status: publicError.status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
}
