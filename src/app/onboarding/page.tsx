import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WeddingWelcome } from '@/components/workspace/welcome';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Your wedding starts here — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (context.overview) redirect('/account');
  return <WeddingWelcome name={context.organizer.name} />;
}
