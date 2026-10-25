import 'server-only';
import { Types } from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
// Read-only cross-module counts. Every query is bound to trusted membership.
// Planning write models/services will be introduced with their own features.
export async function workspaceCounts(weddingId: string) {
  const db = await connectDatabase();
  const tenant = { weddingId: new Types.ObjectId(weddingId) };
  const [functions, tasks, guests, expenseRecords] = await Promise.all([
    db.connection.collection('events').countDocuments(tenant),
    db.connection
      .collection('tasks')
      .countDocuments({ ...tenant, status: { $ne: 'done' } }),
    db.connection.collection('guestContacts').countDocuments(tenant),
    db.connection.collection('expenses').countDocuments(tenant),
  ]);
  return { functions, tasks, guests, expenseRecords };
}
