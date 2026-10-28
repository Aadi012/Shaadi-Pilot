// Keep one key/payload after an uncertain response. Changing it could duplicate a
// successful write whose response was lost. Discarding is an explicit user choice.
export type CreateAttempt<T> = { key: string; body: T };
export function prepareCreate<T>(
  previous: CreateAttempt<T> | null,
  body: T,
): CreateAttempt<T> {
  if (previous && JSON.stringify(previous.body) !== JSON.stringify(body))
    throw new Error(
      'The previous save may have succeeded. Retry its unchanged details first, or discard and refresh before starting another.',
    );
  return previous ?? { key: crypto.randomUUID(), body };
}
