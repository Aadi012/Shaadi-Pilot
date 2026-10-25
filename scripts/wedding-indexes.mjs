import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { weddingIndexes } from '../src/modules/weddings/indexes.ts';
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
  for (const { collection, key, ...options } of weddingIndexes)
    await mongoose.connection.collection(collection).createIndex(key, options);
  await mongoose.connection.db
    .createCollection('weddingCreations')
    .catch((error) => {
      if (error.code !== 48) throw error;
    });
  console.info('Wedding indexes ready (v1). No records or indexes removed.');
} catch {
  console.error(
    'Wedding index setup failed. Check database access and existing index definitions. Details withheld.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
