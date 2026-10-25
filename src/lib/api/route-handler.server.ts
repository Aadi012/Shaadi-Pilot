import 'server-only';
import { randomUUID } from 'node:crypto';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import type { ErrorDiagnostic } from '@/lib/api/error-diagnostics.server';
import { apiErrorResponse } from '@/lib/api/responses.server';
import { logRequest } from '@/lib/logging/logger.server';

type ApiHandler<Context> = (
  request: Request,
  context: Context,
  requestId: string,
) => Response | Promise<Response>;

// Infrastructure only: this wrapper does not authenticate or authorize callers.
// Supply a fixed route template, never a URL containing IDs, queries or secrets.
// Future protected routes must resolve a principal, enforce CSRF and validate
// input before invoking an authorized application service.
export function withApiHandler<Context = unknown>(
  route: string,
  handler: ApiHandler<Context>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    // Generate our own ID so caller-supplied tracing text cannot enter logs.
    const requestId = randomUUID();
    const startedAt = performance.now();
    let response: Response;
    let errorDiagnostic: ErrorDiagnostic | undefined;

    try {
      response = await handler(request, context, requestId);
    } catch (error) {
      errorDiagnostic = describeApiError(error);
      response = apiErrorResponse(error, requestId);
    }

    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    headers.set('Cache-Control', 'no-store');
    if (response.status === 429) headers.set('Retry-After', '900');

    logRequest({
      requestId,
      method: request.method,
      route,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      errorDiagnostic,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
