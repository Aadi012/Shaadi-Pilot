import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { members, invitations } from '@/modules/memberships/service.server';
import { Team } from '@/components/workspace/team';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { logRequest } from '@/lib/logging/logger.server';
import { describeApiError } from '@/lib/api/error-diagnostics.server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Planning team — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  if (context.overview.role !== 'admin') redirect('/account');
  let data;
  try {
    data = await Promise.all([
      members(context.organizer.id),
      invitations(context.organizer.id),
    ]);
  } catch (error) {
    logRequest({
      requestId: randomUUID(),
      method: 'GET',
      route: '/account/team',
      status: 503,
      durationMs: 0,
      errorDiagnostic: describeApiError(error),
    });
    return <WorkspaceAccessError />;
  }
  return (
    <Team
      wedding={context.overview.wedding}
      name={context.organizer.name}
      userId={context.organizer.id}
      initialMembers={data[0]}
      initialInvitations={data[1]}
    />
  );
}
