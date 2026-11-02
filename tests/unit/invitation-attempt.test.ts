import { describe, expect, it } from 'vitest';
import {
  reconcileInvitationAttempt,
  invitationActionSnapshot,
  invitationNavigationBlocked,
  type InvitationAttempt,
} from '@/components/workspace/invitation-attempt';
import type { CreateAttempt } from '@/lib/api/create-attempt';
const link = { id: 'link', version: 4, active: true, expiresAt: '2027-01-01' };
describe('Invitation request recovery', () => {
  it.each(['send', 'rotate', 'remind'] as const)(
    'releases obsolete %s attempts after a newer generation',
    (action) => {
      const attempt = {
        key: 'original-key',
        body: { action, guestVersion: 1, version: 3 },
      };
      expect(reconcileInvitationAttempt(attempt, link)).toBeNull();
      expect(
        invitationNavigationBlocked(
          false,
          reconcileInvitationAttempt(attempt, link),
        ),
      ).toBe(false);
    },
  );
  it('retains the same email retry key and blocks editing or closing while unresolved', () => {
    const attempt: CreateAttempt<InvitationAttempt> = {
      key: 'original-key',
      body: { action: 'send', guestVersion: 1, version: 4 },
    };
    expect(reconcileInvitationAttempt(attempt, link)).toBe(attempt);
    expect(reconcileInvitationAttempt(attempt, null)).toBe(attempt);
    expect(reconcileInvitationAttempt(attempt, { ...link, version: 3 })).toBe(
      attempt,
    );
    expect(invitationNavigationBlocked(false, attempt)).toBe(true);
    expect(invitationNavigationBlocked(true, null)).toBe(true);
    expect(invitationNavigationBlocked(false, null)).toBe(false);
  });
  it('reconciles issue only after a link exists', () => {
    const attempt: CreateAttempt<InvitationAttempt> = {
      key: 'original-key',
      body: { action: 'issue', guestVersion: 1 },
    };
    expect(reconcileInvitationAttempt(attempt, null)).toBe(attempt);
    expect(reconcileInvitationAttempt(attempt, link)).toBeNull();
  });
});

it('allows separately confirmed revocation of the reviewed version without reusing a send payload', () => {
  const attempt: CreateAttempt<InvitationAttempt> = {
    key: 'original-key',
    body: { action: 'send', guestVersion: 1, version: 3 },
  };
  expect(invitationActionSnapshot('revoke', attempt, 2, 4)).toEqual({
    action: 'revoke',
    guestVersion: 2,
    version: 4,
  });
  expect(invitationActionSnapshot('send', attempt, 2, 4)).toBe(attempt.body);
  expect(() => invitationActionSnapshot('rotate', attempt, 2, 4)).toThrow(
    'unresolved',
  );
  expect(attempt.key).toBe('original-key');
});
