import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { requireEmptyBody } from '@/lib/api/require-empty-body.server';

function request(body?: BodyInit) {
  const options = {
    method: 'DELETE',
    ...(body === undefined ? {} : { body }),
    duplex: 'half',
  };
  return new Request('http://localhost:3000/api/v1/members/test', options);
}
describe('DELETE empty-content validation', () => {
  it('accepts a null body', async () => {
    await expect(requireEmptyBody(request())).resolves.toBeUndefined();
  });
  it('accepts a non-null empty body stream', async () => {
    const input = request('');
    expect(input.body).not.toBeNull();
    await expect(requireEmptyBody(input)).resolves.toBeUndefined();
    expect(input.body!.locked).toBe(false);
  });
  it('accepts empty stream chunks followed by EOF', async () => {
    const input = request(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array());
          controller.close();
        },
      }),
    );
    await expect(requireEmptyBody(input)).resolves.toBeUndefined();
    expect(input.body!.locked).toBe(false);
  });
  it.each(['{}', ' ', 'x'])('rejects any nonempty payload %j', async (body) => {
    await expect(requireEmptyBody(request(body))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
    });
  });
  it('cancels after the first payload chunk and releases the lock', async () => {
    const cancel = vi.fn();
    const input = request(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel,
      }),
    );
    await expect(requireEmptyBody(input)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(input.body!.locked).toBe(false);
  });
});
