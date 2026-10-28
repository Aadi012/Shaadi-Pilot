import type { CreateAttempt } from '@/lib/api/create-attempt';
export class GuestRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
// A later rejected request cannot disprove an earlier lost acknowledgement.
export function guestCreateAfterFailure<T>(
  attempt: CreateAttempt<T> | null,
  error: unknown,
  previouslyUncertain: boolean,
  dispatched: boolean,
) {
  const rejected =
    error instanceof GuestRequestError &&
    ((error.status === 404 && error.code === 'NOT_FOUND') ||
      (error.status === 422 && error.code === 'VALIDATION_ERROR') ||
      (error.status === 400 && error.code === 'MALFORMED_JSON') ||
      (error.status === 401 && error.code === 'UNAUTHENTICATED') ||
      (error.status === 403 &&
        ['FORBIDDEN', 'CSRF_FAILED'].includes(error.code)) ||
      (error.status === 409 && error.code === 'WEDDING_CONTEXT_CHANGED') ||
      (error.status === 429 && error.code === 'RATE_LIMITED'));
  if (!previouslyUncertain && (!dispatched || rejected))
    return { attempt: null, uncertain: false };
  return { attempt, uncertain: previouslyUncertain || dispatched };
}
// Translate transport failures separately from the API's actionable validation
// and conflict messages. The caller keeps its draft and create key for retry.
export async function guestResponseData(
  request: Promise<Response>,
  action: 'load' | 'save' = 'load',
) {
  let response: Response;
  try {
    response = await request;
  } catch {
    throw new Error(
      action === 'save'
        ? 'We couldn’t connect to save this guest. Check your internet connection, then try Save guest again. Your draft is still here; retrying the same details is safe.'
        : 'We couldn’t connect to load guest details. Check your internet connection, then try again.',
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      action === 'save'
        ? 'We couldn’t read the save response. Your draft is still here. Try Save guest again with the same details to safely check whether it was saved.'
        : 'We couldn’t read the server response. Try loading the guest details again.',
    );
  }
  if (!response.ok)
    throw new GuestRequestError(
      result.error?.message ?? 'Could not complete this request. Try again.',
      response.status,
      typeof result.error?.code === 'string' ? result.error.code : '',
    );
  return result.data;
}
