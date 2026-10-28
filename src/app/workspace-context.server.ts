import 'server-only';
// Page-level composition keeps dashboard and wedding modules acyclic.
import { randomUUID } from 'node:crypto';
import { currentSession } from '@/modules/auth/http.server';
import { weddingOverview } from '@/modules/dashboard/service.server';
import { logRequest } from '@/lib/logging/logger.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
export async function loadWorkspacePage() {
  const startedAt = performance.now();
  try {
    const current = await currentSession(true);
    if (!current) return { kind: 'anonymous' } as const;
    const overview = await weddingOverview(current.user._id.toString());
    return {
      kind: 'ready',
      organizer: {
        id: current.user._id.toString(),
        name: current.user.displayName,
        email: current.user.emailNormalized,
      },
      overview,
      now: new Date().toISOString(),
    } as const;
  } catch (error) {
    logRequest({
      requestId: randomUUID(),
      method: 'GET',
      route: '/(workspace)',
      status: 503,
      durationMs: Math.round(performance.now() - startedAt),
      errorDiagnostic: describeApiError(error),
    });
    return { kind: 'unavailable' } as const;
  }
}
