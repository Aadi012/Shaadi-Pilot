import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import { ApiError } from '@/lib/api/errors';
import { apiSuccess } from '@/lib/api/responses.server';
import { withApiHandler } from '@/lib/api/route-handler.server';
import { ConfigurationError } from '@/lib/config/env.server';

describe('API boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('redacts unexpected errors, raw URLs and caller tracing IDs', async () => {
    const secret = 'private-token-and-password';
    const route = withApiHandler('/api/v1/example/{id}', () => {
      throw new Error(`MongoDB connection failed: ${secret}`);
    });
    const response = await route(
      new Request(`https://example.com/api/v1/example/${secret}?t=${secret}`, {
        headers: { 'X-Request-Id': secret },
      }),
      undefined,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(body.meta.requestId).toBe(response.headers.get('X-Request-Id'));
    expect(body.meta.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret,
    );
    expect(console.error).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject(
      {
        requestId: body.meta.requestId,
        errorCategory: 'unexpected',
        errorCode: 'UNEXPECTED_ERROR',
        route: '/api/v1/example/{id}',
        status: 500,
      },
    );
  });

  it('preserves deliberately public domain errors', async () => {
    const route = withApiHandler('/api/v1/example', () => {
      throw new ApiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action',
      });
    });
    const response = await route(new Request('https://example.com'), undefined);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({
      errorCategory: 'application',
      errorCode: 'FORBIDDEN',
      status: 403,
    });
  });

  it('does not expose sensitive custom schema messages', async () => {
    const secret = 'sensitive-input-value';
    const route = withApiHandler('/api/v1/example', () => {
      z.object({ name: z.string().refine(() => false, secret) }).parse({
        name: secret,
      });
      return new Response();
    });
    const response = await route(new Request('https://example.com'), undefined);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.details).toEqual([
      { field: 'name', reason: 'Invalid value' },
    ]);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({
      errorCategory: 'validation',
      errorCode: 'VALIDATION_ERROR',
    });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      secret,
    );
  });

  it.each([
    [new TypeError('private-value'), 'unexpected', 'TYPE_ERROR'],
    [new RangeError('private-value'), 'unexpected', 'RANGE_ERROR'],
    [new ReferenceError('private-value'), 'unexpected', 'REFERENCE_ERROR'],
    [new SyntaxError('private-value'), 'unexpected', 'SYNTAX_ERROR'],
    [
      new ConfigurationError(['private-value']),
      'configuration',
      'CONFIGURATION_ERROR',
    ],
  ])(
    'logs safe classification for %s without exception payloads',
    async (error, errorCategory, errorCode) => {
      // Changing .name or adding arbitrary fields must not change classification
      // or cause their values to be included in logs.
      Object.assign(error, {
        name: 'private-value',
        code: 'private-value',
        cause: { accessToken: 'private-value' },
      });
      const route = withApiHandler('/api/v1/example', () => {
        throw error;
      });
      const response = await route(
        new Request('https://example.com'),
        undefined,
      );
      const body = await response.json();
      const entry = JSON.parse(vi.mocked(console.error).mock.calls[0][0]);

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(entry).toMatchObject({
        errorCategory,
        errorCode,
        requestId: body.meta.requestId,
      });
      expect(JSON.stringify(entry)).not.toContain('private-value');
      expect(entry).not.toHaveProperty('message');
      expect(entry).not.toHaveProperty('stack');
      expect(entry).not.toHaveProperty('cause');
    },
  );

  it('does not trust spoofed error classes or arbitrary thrown objects', async () => {
    const route = withApiHandler('/api/v1/example', () => {
      throw {
        name: 'TypeError',
        code: 'FORBIDDEN',
        message: 'private-value',
      };
    });
    const response = await route(new Request('https://example.com'), undefined);
    const entry = JSON.parse(vi.mocked(console.error).mock.calls[0][0]);

    expect(response.status).toBe(500);
    expect(entry.errorCode).toBe('UNEXPECTED_ERROR');
    expect(JSON.stringify(entry)).not.toContain('private-value');
  });

  it('uses a safe fallback for uncatalogued application error codes', async () => {
    const route = withApiHandler('/api/v1/example', () => {
      throw new ApiError({
        status: 409,
        code: 'CUSTOM_BUSINESS_RULE',
        message: 'The operation conflicts with the current state',
      });
    });
    await route(new Request('https://example.com'), undefined);
    const entry = JSON.parse(vi.mocked(console.info).mock.calls[0][0]);

    expect(entry.errorCategory).toBe('application');
    expect(entry.errorCode).toBe('APPLICATION_ERROR');
    expect(JSON.stringify(entry)).not.toContain('CUSTOM_BUSINESS_RULE');
  });

  it('returns a correlated success envelope without private caching', async () => {
    const route = withApiHandler('/api/v1/example', (_request, _context, id) =>
      apiSuccess({ id: 'example' }, id),
    );
    const response = await route(new Request('https://example.com'), undefined);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: 'example' });
    expect(body.meta.requestId).toBe(response.headers.get('X-Request-Id'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('preserves bodyless responses', async () => {
    const route = withApiHandler(
      '/api/v1/example',
      () => new Response(null, { status: 204 }),
    );
    const response = await route(new Request('https://example.com'), undefined);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
  });
});
