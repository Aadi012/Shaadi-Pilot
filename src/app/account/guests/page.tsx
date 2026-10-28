import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { Guests } from '@/components/workspace/guests';
import { listGuests } from '@/modules/guests/service.server';
import { listEvents } from '@/modules/events/service.server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Guest Directory — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  const [initialList, initialEvents] = await Promise.all([
    listGuests(context.organizer.id, {}),
    listEvents(context.organizer.id),
  ]);
  return (
    <Guests
      wedding={context.overview.wedding}
      name={context.organizer.name}
      role={context.overview.role}
      userId={context.organizer.id}
      initialList={initialList}
      initialEvents={initialEvents}
    />
  );
}
