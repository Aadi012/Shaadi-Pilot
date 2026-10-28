import 'server-only';
import { currentWedding } from '@/modules/weddings/service.server';
import { workspaceCounts } from './repository.server';
import { taskOverview } from '@/modules/tasks/service.server';
export async function weddingOverview(userId: string) {
  const context = await currentWedding(userId);
  return context
    ? {
        ...context,
        counts: await workspaceCounts(context.wedding.id),
        taskOverview: await taskOverview(context.wedding.id, userId),
      }
    : null;
}
