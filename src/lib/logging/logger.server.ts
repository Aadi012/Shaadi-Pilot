import 'server-only';
import type { ErrorDiagnostic } from '@/lib/api/error-diagnostics.server';

type RequestLog = {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  errorDiagnostic?: ErrorDiagnostic;
};

export function logRequest(fields: RequestLog): void {
  // Copy only approved fields. Never accept raw URLs, request bodies or Errors.
  const entry = {
    timestamp: new Date().toISOString(),
    level: fields.status >= 500 ? 'error' : 'info',
    requestId: fields.requestId,
    method: fields.method,
    route: fields.route,
    status: fields.status,
    durationMs: fields.durationMs,
    ...(fields.errorDiagnostic
      ? {
          errorCategory: fields.errorDiagnostic.errorCategory,
          errorCode: fields.errorDiagnostic.errorCode,
        }
      : {}),
  };

  if (fields.status >= 500) {
    console.error(JSON.stringify(entry));
  } else {
    console.info(JSON.stringify(entry));
  }
}
