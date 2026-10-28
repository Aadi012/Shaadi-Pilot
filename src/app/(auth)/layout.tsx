import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { currentSession } from '@/modules/auth/http.server';
import { pendingInvitation } from '@/modules/memberships/context.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
import { logRequest } from '@/lib/logging/logger.server';

export const dynamic = 'force-dynamic';
async function readSession() {
  const startedAt = performance.now();
  try {
    return await currentSession();
  } catch (error) {
    logRequest({
      requestId: randomUUID(),
      method: 'GET',
      route: '/(auth)',
      status: 503,
      durationMs: Math.round(performance.now() - startedAt),
      errorDiagnostic: describeApiError(error),
    });
    return undefined;
  }
}
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await readSession();
  if (session === undefined)
    return (
      <main>
        <h1>Account access is temporarily unavailable</h1>
        <p>Please try again shortly.</p>
      </main>
    );
  if (session) redirect((await pendingInvitation()) ? '/join' : '/account');
  return <>{children}</>;
}
