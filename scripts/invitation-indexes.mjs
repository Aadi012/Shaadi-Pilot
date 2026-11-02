import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { invitationIndexes } from '../src/modules/invitations/indexes.ts';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
try {
  if (
    !process.env.MONGODB_URI ||
    !/^[a-zA-Z0-9_-]+$/.test(process.env.MONGODB_DB_NAME ?? '')
  )
    throw new Error();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });
  for (const { collection, key, ...options } of invitationIndexes)
    await mongoose.connection.collection(collection).createIndex(key, options);
  console.info(
    'Guest invitation indexes applied. Existing records were not changed.',
  );
} catch {
  console.error(
    'Guest invitation index setup failed; connection details withheld.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
