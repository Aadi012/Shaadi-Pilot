import 'server-only';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { ConfigurationError } from '@/lib/config/env.server';

export type ErrorDiagnostic = {
  errorCategory:
    | 'application'
    | 'validation'
    | 'configuration'
    | 'provider'
    | 'dependency'
    | 'unexpected';
  errorCode: string;
};

const publicErrorCodes = new Set([
  'MALFORMED_JSON',
  'INVALID_QUERY',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'CSRF_FAILED',
  'NOT_FOUND',
  'EMAIL_ALREADY_EXISTS',
  'USER_ALREADY_IN_WEDDING',
  'SLUG_TAKEN',
  'DUPLICATE_INVITE',
  'RSVP_CLOSED',
  'INVALID_OR_EXPIRED_LINK',
  'PRECONDITION_FAILED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'PROVIDER_FAILURE',
  'SERVICE_UNAVAILABLE',
  'IDEMPOTENCY_CONFLICT',
]);

// Inspect trusted classes and allowlisted codes only. Error names, messages,
// stacks, causes and arbitrary provider fields may contain private data.
export function describeApiError(error: unknown): ErrorDiagnostic {
  if (error instanceof ApiError) {
    const errorCode = publicErrorCodes.has(error.code)
      ? error.code
      : 'APPLICATION_ERROR';

    return {
      errorCategory:
        errorCode === 'PROVIDER_FAILURE'
          ? 'provider'
          : errorCode === 'SERVICE_UNAVAILABLE'
            ? 'dependency'
            : 'application',
      errorCode,
    };
  }

  if (error instanceof ZodError) {
    return { errorCategory: 'validation', errorCode: 'VALIDATION_ERROR' };
  }

  if (error instanceof ConfigurationError) {
    return { errorCategory: 'configuration', errorCode: 'CONFIGURATION_ERROR' };
  }

  const errorCode =
    error instanceof TypeError
      ? 'TYPE_ERROR'
      : error instanceof RangeError
        ? 'RANGE_ERROR'
        : error instanceof ReferenceError
          ? 'REFERENCE_ERROR'
          : error instanceof SyntaxError
            ? 'SYNTAX_ERROR'
            : 'UNEXPECTED_ERROR';

  return { errorCategory: 'unexpected', errorCode };
}
