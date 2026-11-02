import { redirect } from 'next/navigation';
import { loadWorkspacePage } from '@/app/workspace-context.server';
import { WorkspaceAccessError } from '@/components/workspace/access-error';
import { Gallery } from '@/components/workspace/gallery';
import { listPhotos } from '@/modules/gallery/service.server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Private Gallery — ShaadiPilot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page() {
  const context = await loadWorkspacePage();
  if (context.kind === 'anonymous') redirect('/login');
  if (context.kind === 'unavailable') return <WorkspaceAccessError />;
  if (!context.overview) redirect('/onboarding');
  let initial = null;
  try {
    initial = await listPhotos(context.organizer.id);
  } catch {
    /* Render the recoverable setup/read failure without provider details. */
  }
  return (
    <Gallery
      wedding={context.overview.wedding}
      name={context.organizer.name}
      role={context.overview.role}
      userId={context.organizer.id}
      initial={initial}
    />
  );
}
