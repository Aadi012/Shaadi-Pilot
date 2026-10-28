import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { Functions } from '@/components/workspace/functions';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Wedding Functions — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  return (
    <Functions
      wedding={context.overview.wedding}
      role={context.overview.role}
      name={context.organizer.name}
      userId={context.organizer.id}
    />
  );
}
