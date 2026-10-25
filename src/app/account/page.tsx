import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WeddingOverview } from '@/components/workspace/overview';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
export const metadata = {
  title: 'Wedding overview — ShaadiPilot',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  return (
    <WeddingOverview
      {...context.overview}
      name={context.organizer.name}
      now={context.now}
    />
  );
}
