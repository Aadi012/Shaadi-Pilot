import { GuestRequestError } from './guest-request';

export const VENDOR_REQUEST_TIMEOUT_MS = 15_000;

// Include response-body reads in the deadline. Aborting a browser request does
// not prove a server-side write was cancelled; retain create receipts/drafts.
export async function vendorRequest(
  url: string,
  init: RequestInit = {},
  action: 'load' | 'save' | 'remove' = 'load',
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          action === 'remove'
            ? 'Removal is taking longer than expected. It may already have completed. Refresh the directory and review before trying again.'
            : action === 'save'
              ? 'The save is taking longer than expected. Your draft is kept. Retry the same details to check whether it was saved.'
              : 'Loading is taking longer than expected. Check your connection and retry.',
        ),
      );
    }, VENDOR_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      vendorResponseData(
        fetch(url, { ...init, signal: controller.signal }),
        action,
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function vendorResponseData(
  request: Promise<Response>,
  action: 'load' | 'save' | 'remove' = 'load',
) {
  let response: Response;
  try {
    response = await request;
  } catch {
    throw new Error(
      action === 'remove'
        ? 'We couldn’t confirm removal. It may already have completed. Check your connection, then refresh the directory and review.'
        : action === 'save'
          ? 'We couldn’t connect to save this vendor. Check your connection and retry with the same details. Your draft is kept.'
          : 'We couldn’t load vendors. Check your connection and retry.',
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      action === 'remove'
        ? 'The removal response could not be read. Refresh the directory and review whether the vendor was removed.'
        : action === 'save'
          ? 'The save response could not be read. Your draft is kept; retry the same details to check whether it was saved.'
          : 'The server response could not be read. Try loading vendors again.',
    );
  }
  if (!response.ok)
    throw new GuestRequestError(
      result.error?.message ??
        'Could not complete this vendor request. Try again.',
      response.status,
      typeof result.error?.code === 'string' ? result.error.code : '',
    );
  return result.data;
}
