import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { Vendors } from '@/components/workspace/vendors';
import { listVendors } from '@/modules/vendors/service.server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Vendors — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  let data;
  try {
    data = await listVendors(context.organizer.id);
  } catch {
    return <WorkspaceAccessError />;
  }
  return (
    <Vendors
      wedding={context.overview.wedding}
      name={context.organizer.name}
      role={context.overview.role}
      userId={context.organizer.id}
      initial={data}
    />
  );
}
