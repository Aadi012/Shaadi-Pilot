import 'server-only';
import mongoose, {
  Schema,
  type ClientSession,
  type Model,
  type Types,
  type QueryFilter,
} from 'mongoose';
import { connectDatabase } from '@/lib/db/mongoose.server';
import type { TaskInput, TaskQuery } from './contracts';
export interface TaskRecord extends Omit<
  TaskInput,
  'eventId' | 'assignedToUserId' | 'dueAt'
> {
  _id: Types.ObjectId;
  weddingId: Types.ObjectId;
  eventId: Types.ObjectId | null;
  assignedToUserId: Types.ObjectId | null;
  assignedMembershipVersion: number | null;
  dueAt: Date | null;
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  __v: number;
}
const schema = new Schema<TaskRecord>(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['todo', 'inProgress', 'done'],
      required: true,
    },
    eventId: { type: Schema.Types.ObjectId, default: null },
    assignedToUserId: { type: Schema.Types.ObjectId, default: null },
    assignedMembershipVersion: { type: Number, default: null },
    dueAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
    __v: { type: Number, default: 0 },
  },
  { collection: 'tasks', autoIndex: false, timestamps: true },
);
export const Task =
  (mongoose.models.PlanningTask as Model<TaskRecord> | undefined) ??
  mongoose.model<TaskRecord>('PlanningTask', schema);
interface Receipt {
  _id: string;
  weddingId: Types.ObjectId;
  requestHash: string;
  taskId: Types.ObjectId;
}
const receiptSchema = new Schema<Receipt>(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    requestHash: String,
    taskId: Schema.Types.ObjectId,
  },
  { collection: 'taskRequests', autoIndex: false, timestamps: true },
);
const ReceiptModel =
  (mongoose.models.TaskRequest as Model<Receipt> | undefined) ??
  mongoose.model<Receipt>('TaskRequest', receiptSchema);
export const database = connectDatabase;
export const find = (
  weddingId: Types.ObjectId,
  id: Types.ObjectId,
  session?: ClientSession,
) =>
  Task.findOne({ _id: id, weddingId, archivedAt: null })
    .session(session ?? null)
    .lean();
export const findRequest = (
  _id: string,
  weddingId: Types.ObjectId,
  session: ClientSession,
) => ReceiptModel.findOne({ _id, weddingId }).session(session).lean();
export const recordRequest = (receipt: Receipt, session: ClientSession) =>
  ReceiptModel.create([receipt], { session });
export async function insert(
  data: Omit<TaskRecord, '_id' | '__v'>,
  session: ClientSession,
) {
  const [row] = await Task.create([{ ...data, __v: 0 }], { session });
  return row.toObject();
}
export const update = (
  weddingId: Types.ObjectId,
  id: Types.ObjectId,
  version: number,
  data: Partial<TaskRecord>,
  session: ClientSession,
) =>
  Task.findOneAndUpdate(
    { _id: id, weddingId, archivedAt: null, __v: version },
    { $set: data, $inc: { __v: 1 } },
    { session, returnDocument: 'after' },
  ).lean();
export function list(
  weddingId: Types.ObjectId,
  query: TaskQuery,
  before: Types.ObjectId | undefined,
  now: Date,
) {
  const filter: QueryFilter<TaskRecord> = { weddingId, archivedAt: null };
  if (before) filter._id = { $lt: before };
  if (query.status) filter.status = query.status;
  if (query.assignedToUserId)
    filter.assignedToUserId =
      query.assignedToUserId === 'unassigned'
        ? null
        : new mongoose.Types.ObjectId(query.assignedToUserId);
  if (query.eventId)
    filter.eventId =
      query.eventId === 'none'
        ? null
        : new mongoose.Types.ObjectId(query.eventId);
  if (query.dueAfter || query.dueBefore)
    filter.dueAt = {
      ...(query.dueAfter ? { $gte: new Date(query.dueAfter) } : {}),
      ...(query.dueBefore ? { $lt: new Date(query.dueBefore) } : {}),
    };
  if (query.overdue)
    filter.$and = [
      { status: { $ne: 'done' } },
      { dueAt: { $ne: null, $lt: now } },
    ];
  return Task.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .lean();
}
export async function summary(
  weddingId: Types.ObjectId,
  userId: string,
  now: Date,
  membershipVersion = 0,
) {
  const [row] = await Task.aggregate<{
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
    assigned: number;
    unassigned: number;
  }>([
    { $match: { weddingId, archivedAt: null } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'inProgress'] }, 1, 0] },
        },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'done'] },
                  { $ne: ['$dueAt', null] },
                  { $lt: ['$dueAt', now] },
                ],
              },
              1,
              0,
            ],
          },
        },
        assigned: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $eq: [
                      '$assignedToUserId',
                      new mongoose.Types.ObjectId(userId),
                    ],
                  },
                  {
                    $eq: [
                      { $ifNull: ['$assignedMembershipVersion', 0] },
                      membershipVersion,
                    ],
                  },
                  { $ne: ['$status', 'done'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        unassigned: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$assignedToUserId', null] },
                  { $ne: ['$status', 'done'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  return row
    ? {
        total: row.total,
        todo: row.todo,
        inProgress: row.inProgress,
        done: row.done,
        overdue: row.overdue,
        assigned: row.assigned,
        unassigned: row.unassigned,
      }
    : {
        total: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        overdue: 0,
        assigned: 0,
        unassigned: 0,
      };
}
export const assignedIncomplete = (
  weddingId: Types.ObjectId,
  userId: string,
  membershipVersion: number,
) =>
  Task.find({
    weddingId,
    archivedAt: null,
    assignedToUserId: new mongoose.Types.ObjectId(userId),
    assignedMembershipVersion: membershipVersion,
    status: { $ne: 'done' },
  })
    .sort({ _id: -1 })
    .limit(5)
    .lean();
