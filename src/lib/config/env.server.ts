import 'server-only';
import { z } from 'zod';

type EnvironmentSource = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor(keys: string[]) {
    super(
      `Invalid environment configuration: ${[...new Set(keys)].join(', ')}`,
    );
    this.name = 'ConfigurationError';
  }
}

function parseConfiguration<T>(schema: z.ZodType<T>, values: unknown): T {
  const result = schema.safeParse(values);

  if (!result.success) {
    // Report keys only: validation messages and input values may contain secrets.
    throw new ConfigurationError(
      result.error.issues.map((issue) => issue.path.join('.')),
    );
  }

  return result.data;
}

const appSchema = z.object({
  APP_BASE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }

    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  }),
});

export function readAppEnvironment(source: EnvironmentSource = process.env) {
  const config = parseConfiguration(appSchema, {
    APP_BASE_URL:
      source.APP_BASE_URL ??
      (source.NODE_ENV === 'production' ? undefined : 'http://localhost:3000'),
  });

  if (
    source.NODE_ENV === 'production' &&
    new URL(config.APP_BASE_URL).protocol !== 'https:'
  ) {
    throw new ConfigurationError(['APP_BASE_URL']);
  }

  return config;
}

const databaseSchema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/\S+$/),
  MONGODB_DB_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export function readDatabaseEnvironment(
  source: EnvironmentSource = process.env,
) {
  return parseConfiguration(databaseSchema, {
    MONGODB_URI: source.MONGODB_URI,
    MONGODB_DB_NAME: source.MONGODB_DB_NAME,
  });
}
