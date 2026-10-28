import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { taskIndexes } from '../src/modules/tasks/indexes.ts';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
try {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME)
    throw new Error();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });
  for (const { collection, key, ...options } of taskIndexes)
    await mongoose.connection.collection(collection).createIndex(key, options);
  console.log('Task indexes ready. No records removed.');
} catch {
  console.error('Task index setup failed; private details withheld.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
