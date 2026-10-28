import 'server-only';
import { Types } from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
// Read-only cross-module counts. Every query is bound to trusted membership.
// Planning write models/services will be introduced with their own features.
export async function workspaceCounts(weddingId: string) {
  const db = await connectDatabase();
  const tenant = { weddingId: new Types.ObjectId(weddingId) };
  const [functions, tasks, guests, expenseRecords] = await Promise.all([
    db.connection
      .collection('events')
      .countDocuments({ ...tenant, status: { $ne: 'archived' } }),
    db.connection
      .collection('tasks')
      .countDocuments({ ...tenant, status: { $ne: 'done' } }),
    db.connection.collection('guestContacts').countDocuments(tenant),
    db.connection.collection('expenses').countDocuments(tenant),
  ]);
  const upcoming = await db.connection
    .collection('events')
    .find(
      { ...tenant, status: 'active', endsAt: { $gt: new Date() } },
      { projection: { title: 1, startsAt: 1, timezone: 1 } },
    )
    .sort({ startsAt: 1, _id: 1 })
    .limit(5)
    .toArray();
  return {
    functions,
    tasks,
    guests,
    expenseRecords,
    upcoming: upcoming.map((row) => ({
      id: row._id.toString(),
      title: String(row.title),
      startsAt: (row.startsAt as Date).toISOString(),
      timezone: String(row.timezone),
    })),
  };
}
