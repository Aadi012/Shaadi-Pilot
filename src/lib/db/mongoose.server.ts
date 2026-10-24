import 'server-only';
import mongoose from 'mongoose';
import { readDatabaseEnvironment } from '@/lib/config/env.server';

type ConnectionCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const processGlobal = globalThis as typeof globalThis & {
  shaadiPilotMongoose?: ConnectionCache;
};

const cache = (processGlobal.shaadiPilotMongoose ??= {
  connection: null,
  promise: null,
});

// Importing this module never opens a connection. Call only inside server work.
export async function connectDatabase(): Promise<typeof mongoose> {
  if (cache.connection?.connection.readyState === 1) {
    return cache.connection;
  }

  if (!cache.promise) {
    const { MONGODB_URI, MONGODB_DB_NAME } = readDatabaseEnvironment();

    cache.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB_NAME,
      autoIndex: process.env.NODE_ENV !== 'production',
      bufferCommands: false,
      minPoolSize: 0,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
    });
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } finally {
    // A rejected connection must not poison future attempts.
    cache.promise = null;
  }
}
