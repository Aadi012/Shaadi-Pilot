import nextEnv from '@next/env';
import mongoose from 'mongoose';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
try {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME)
    throw new Error();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });
  await mongoose.connection
    .collection('events')
    .createIndex(
      { weddingId: 1, startsAt: 1, _id: 1 },
      { name: 'events_schedule_v1' },
    );
  console.log('Event schedule index ready. No records removed.');
} catch {
  console.error('Event index setup failed; private details withheld.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
