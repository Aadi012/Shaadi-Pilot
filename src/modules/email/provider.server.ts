import 'server-only';
import { emailEnvironment } from './config.server';
export type ProviderResult =
  | { kind: 'submitted'; id: string }
  | { kind: 'retry' | 'failed' | 'quarantined'; category: string };
export async function sendResendBatch(
  payload: string,
  idempotencyKey: string,
): Promise<ProviderResult> {
  try {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailEnvironment().apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store',
    });
    if (response.status === 429 || response.status >= 500)
      return { kind: 'retry', category: 'provider_transient' };
    if (response.status === 409)
      return { kind: 'quarantined', category: 'provider_conflict' };
    if (!response.ok) return { kind: 'failed', category: 'provider_rejected' };
    const body = await response.json();
    const id: unknown = body?.data?.length === 1 ? body.data[0]?.id : undefined;
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id)
      ? { kind: 'submitted', id }
      : { kind: 'retry', category: 'provider_ambiguous' };
  } catch {
    return { kind: 'retry', category: 'provider_ambiguous' };
  }
}
