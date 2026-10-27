import type { SessionData } from '@/modules/auth/contracts';
import type {
  EditWeddingInput,
  WeddingDto,
} from '@/modules/weddings/contracts';

export const WEDDING_CONTEXT_CHANGED_MESSAGE =
  'Your signed-in wedding changed. Your draft has been kept and was not saved. Sign back in to this wedding or reload to open your current workspace.';

type SaveResult =
  | { kind: 'signed-out' }
  | { kind: 'wedding-changed' }
  | { kind: 'response'; response: Response };

// Bind the draft to its original wedding before using newly bootstrapped CSRF.
// This ID is a client safety check, never a server authorization selector.
export async function saveWeddingDetails(
  saved: Pick<WeddingDto, 'id' | 'version'>,
  details: EditWeddingInput,
): Promise<SaveResult> {
  const bootstrap = await fetch('/api/v1/auth/session', { cache: 'no-store' });
  if (!bootstrap.ok) throw new Error('Session unavailable');
  const { data }: { data: SessionData } = await bootstrap.json();
  if (!data.user) return { kind: 'signed-out' };
  if (data.user.weddingId !== saved.id) return { kind: 'wedding-changed' };

  return {
    kind: 'response',
    response: await fetch('/api/v1/weddings/current', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': data.csrfToken,
        'If-Match': `"${saved.version}"`,
      },
      body: JSON.stringify(details),
    }),
  };
}
