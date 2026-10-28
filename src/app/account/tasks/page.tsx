import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { Tasks } from '@/components/workspace/tasks';
import { listTasks, taskOptions } from '@/modules/tasks/service.server';
import { listEvents } from '@/modules/events/service.server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Wedding Tasks — ShaadiPilot',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  const query = await searchParams;
  const eventId =
    typeof query.eventId === 'string' && /^[a-f0-9]{24}$/.test(query.eventId)
      ? query.eventId
      : undefined;
  const [initialList, initialMembers, initialEvents] = await Promise.all([
    listTasks(context.organizer.id, eventId ? { eventId } : {}),
    taskOptions(context.organizer.id),
    listEvents(context.organizer.id),
  ]);
  return (
    <Tasks
      wedding={context.overview.wedding}
      role={context.overview.role}
      name={context.organizer.name}
      userId={context.organizer.id}
      initialList={initialList}
      initialMembers={initialMembers}
      initialEvents={initialEvents}
      initialFilter={eventId ? 'eventId=' + eventId : ''}
    />
  );
}
