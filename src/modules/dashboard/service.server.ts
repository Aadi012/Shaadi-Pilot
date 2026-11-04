import 'server-only';
import { trustedVendorCount } from '@/modules/vendors/service.server';
import { trustedExpenseSummary } from '@/modules/expenses/service.server';
import { currentWedding } from '@/modules/weddings/service.server';
import { workspaceCounts } from './repository.server';
import { taskOverview } from '@/modules/tasks/service.server';
import { attendanceOverview } from '@/modules/invitations/service.server';
export async function weddingOverview(userId: string) {
  const context = await currentWedding(userId);
  return context
    ? {
        ...context,
        counts: await workspaceCounts(context.wedding.id),
        vendorCount: await trustedVendorCount(context.wedding.id),
        expenseSummary: await trustedExpenseSummary(context.wedding.id),
        taskOverview: await taskOverview(context.wedding.id, userId),
        attendance: await attendanceOverview(context.wedding.id),
      }
    : null;
}
