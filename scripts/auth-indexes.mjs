import nextEnv from '@next/env';
import mongoose from 'mongoose';
import { authIndexes } from '../src/modules/auth/indexes.ts';

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
  for (const { collection, key, ...options } of authIndexes) {
    await mongoose.connection.collection(collection).createIndex(key, options);
  }
  console.info(
    'Authentication indexes ready (v1). No indexes or records removed.',
  );
} catch {
  console.error(
    'Authentication index setup failed. Check database access, existing duplicates and index definitions. Details withheld to protect credentials.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
