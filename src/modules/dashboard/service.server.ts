import 'server-only';
import { currentWedding } from '@/modules/weddings/service.server';
import { workspaceCounts } from './repository.server';
export async function weddingOverview(userId: string) {
  const context = await currentWedding(userId);
  return context
    ? { ...context, counts: await workspaceCounts(context.wedding.id) }
    : null;
}
