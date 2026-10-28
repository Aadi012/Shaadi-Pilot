import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { membershipIndexes } from '../src/modules/memberships/indexes.ts';
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info() {},
  error() {},
});
try {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME)
    throw new Error();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });
  for (const { collection, key, ...options } of membershipIndexes)
    await mongoose.connection.collection(collection).createIndex(key, options);
  console.log('Membership indexes ready (v1). No records or indexes removed.');
} catch {
  console.error(
    'Membership index setup failed; credentials and provider details withheld.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
