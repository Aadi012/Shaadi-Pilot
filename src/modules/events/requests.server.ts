import 'server-only';
import mongoose, {
  Schema,
  type ClientSession,
  type Model,
  type Types,
} from 'mongoose';
interface Receipt {
  _id: string;
  weddingId: Types.ObjectId;
  requestHash: string;
  eventId: Types.ObjectId;
}
const schema = new Schema<Receipt>(
  {
    _id: String,
    weddingId: Schema.Types.ObjectId,
    requestHash: String,
    eventId: Schema.Types.ObjectId,
  },
  { collection: 'eventRequests', autoIndex: false, timestamps: true },
);
const RequestReceipt =
  (mongoose.models.EventRequest as Model<Receipt> | undefined) ??
  mongoose.model<Receipt>('EventRequest', schema);
export const findRequest = (
  _id: string,
  weddingId: Types.ObjectId,
  session: ClientSession,
) => RequestReceipt.findOne({ _id, weddingId }).session(session).lean();
export const recordRequest = (receipt: Receipt, session: ClientSession) =>
  RequestReceipt.create([receipt], { session });
