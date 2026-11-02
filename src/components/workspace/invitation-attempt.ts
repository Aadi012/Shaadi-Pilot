import type { CreateAttempt } from '@/lib/api/create-attempt';
import type { InvitationState } from '@/modules/invitations/contracts';
export type InvitationAction =
  'issue' | 'send' | 'rotate' | 'revoke' | 'remind';
export type InvitationAttempt = {
  action: InvitationAction;
  guestVersion: number;
  version?: number;
};
// New generations fence old writes server-side. Delivery labels do not identify
// which organizer requested an email and cannot reconcile an uncertain send.
export function reconcileInvitationAttempt(
  attempt: CreateAttempt<InvitationAttempt> | null,
  link: InvitationState['link'],
): CreateAttempt<InvitationAttempt> | null {
  if (!attempt || !link) return attempt;
  if (
    attempt.body.action === 'issue' ||
    (attempt.body.version !== undefined && link.version > attempt.body.version)
  )
    return null;
  return attempt;
}
export function invitationNavigationBlocked(
  pending: boolean,
  attempt: CreateAttempt<InvitationAttempt> | null,
) {
  return pending || attempt !== null;
}

export function invitationActionSnapshot(
  action: InvitationAction,
  attempt: CreateAttempt<InvitationAttempt> | null,
  guestVersion: number,
  version?: number,
): InvitationAttempt {
  if (action === 'revoke') return { action, guestVersion, version };
  if (attempt && attempt.body.action !== action)
    throw new Error(
      'The previous request is unresolved. Retry that same action or refresh before starting another.',
    );
  return attempt?.body ?? { action, guestVersion, version };
}
