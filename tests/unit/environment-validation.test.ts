import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ConfigurationError,
  readAppEnvironment,
  readDatabaseEnvironment,
} from '@/lib/config/env.server';

describe('environment validation', () => {
  it('allows local app development without service credentials', () => {
    expect(readAppEnvironment({ NODE_ENV: 'development' })).toEqual({
      APP_BASE_URL: 'http://localhost:3000',
    });
  });

  it('requires a canonical HTTPS origin when production app config is used', () => {
    for (const APP_BASE_URL of [
      undefined,
      'invalid-url-with-a-private-token',
      'http://example.com',
      'https://example.com/path',
      'https://user:secret@example.com',
      'https://example.com?token=secret',
      'https://example.com#token',
      'ftp://example.com',
    ]) {
      expect(() =>
        readAppEnvironment({ NODE_ENV: 'production', APP_BASE_URL }),
      ).toThrow(ConfigurationError);
    }

    expect(
      readAppEnvironment({
        NODE_ENV: 'production',
        APP_BASE_URL: 'https://example.com',
      }),
    ).toEqual({ APP_BASE_URL: 'https://example.com' });
  });

  it('requires explicit database configuration only when requested', () => {
    expect(() => readDatabaseEnvironment({})).toThrow(ConfigurationError);
    expect(
      readDatabaseEnvironment({
        MONGODB_URI: 'mongodb://localhost:27017',
        MONGODB_DB_NAME: 'shaadipilot_test',
      }),
    ).toEqual({
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DB_NAME: 'shaadipilot_test',
    });
  });

  it('does not include invalid configuration values in errors', () => {
    const secret = 'not-a-mongo-uri-with-private-password';

    try {
      readDatabaseEnvironment({
        MONGODB_URI: secret,
        MONGODB_DB_NAME: 'invalid/database',
      });
      expect.fail('Expected invalid configuration to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(String(error)).toContain('MONGODB_URI');
      expect(String(error)).toContain('MONGODB_DB_NAME');
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain('invalid/database');
    }

    expect(() => readAppEnvironment({ APP_BASE_URL: secret })).toThrow(
      'Invalid environment configuration: APP_BASE_URL',
    );
  });
});
