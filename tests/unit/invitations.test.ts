import { describe, it, expect, vi } from 'vitest';
import {
  rsvpInput,
  exchangeInput,
  issueInput,
  partySize,
} from '@/modules/invitations/contracts';
import { guestInviteEmail, guestReminderEmail } from '@/modules/email/template';
import {
  encryptCapability,
  decryptCapability,
} from '@/modules/invitations/security.server';
import { randomBytes } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvitationHub } from '@/components/guest/invitation-hub';
vi.mock('server-only', () => ({}));
const invitationId = '670000000000000000000001';
describe('Private invitation contracts', () => {
  it('accepts unbounded product counts within JSON integer representation and sums exactly', () => {
    expect(
      rsvpInput.parse({
        invitationId,
        status: 'attending',
        additionalGuests: 15,
      }).additionalGuests,
    ).toBe(15);
    const max = rsvpInput.parse({
      invitationId,
      status: 'attending',
      additionalGuests: Number.MAX_SAFE_INTEGER,
    });
    expect(partySize(max.status, max.additionalGuests)).toBe(
      '9007199254740992',
    );
    expect(partySize('pending', 10)).toBe('0');
    expect(partySize('declined', 0)).toBe('0');
  });
  it('rejects extra fields, invalid counts, invented pending responses and decline counts', () => {
    for (const additionalGuests of [
      -1,
      0.5,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
      '2',
    ])
      expect(
        rsvpInput.safeParse({
          invitationId,
          status: 'attending',
          additionalGuests,
        }).success,
      ).toBe(false);
    expect(
      rsvpInput.safeParse({
        invitationId,
        status: 'pending',
        additionalGuests: 0,
      }).success,
    ).toBe(false);
    expect(
      rsvpInput.safeParse({
        invitationId,
        status: 'declined',
        additionalGuests: 1,
      }).success,
    ).toBe(false);
    expect(
      rsvpInput.safeParse({
        invitationId,
        status: 'attending',
        additionalGuests: 1,
        weddingId: invitationId,
      }).success,
    ).toBe(false);
    expect(
      exchangeInput.safeParse({
        publicId: invitationId,
        secret: 'a'.repeat(64),
        eventId: invitationId,
      }).success,
    ).toBe(false);
    expect(
      issueInput.safeParse({ guestVersion: 0, role: 'admin' }).success,
    ).toBe(false);
  });
  it('escapes guest, couple, function and link values in email HTML', () => {
    const email = guestInviteEmail(
      'https://example.test/invitation#secret=a&b="x"',
      '<script>guest</script>',
      '<img src=x>',
      ['<b>Function</b>'],
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;b&gt;Function&lt;/b&gt;');
    expect(email.html).toContain('&amp;b=&quot;x&quot;');
    expect(email.text).toContain('before it starts');
  });
  it('encrypts capabilities with identity-bound authenticated data and fails closed on key replacement', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('TOKEN_ENCRYPTION_KEY_ID', 'unit-v1');
    try {
      const secret = 'a'.repeat(64),
        encrypted = encryptCapability(secret, invitationId);
      expect(JSON.stringify(encrypted)).not.toContain(secret);
      expect(decryptCapability(encrypted, invitationId)).toBe(secret);
      expect(() => decryptCapability(encrypted, 'another-id')).toThrow();
      vi.stubEnv('TOKEN_ENCRYPTION_KEY_ID', 'unit-v2');
      expect(() => decryptCapability(encrypted, invitationId)).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('renders a generic accountless landing without embedding guest data or capabilities', () => {
    const html = renderToStaticMarkup(createElement(InvitationHub));
    expect(html).toContain('Opening your private invitation');
    expect(html).not.toContain('guestName');
    expect(html).not.toContain('secret=');
    expect(html).not.toContain('Login');
  });
});

it('renders reminders with escaped contact details and truthful RSVP wording', () => {
  const email = guestReminderEmail(
    'https://example.test/invitation#secret=x',
    '<b>Guest</b>',
    'A & B',
    ['<script>Function</script>'],
  );
  expect(email.subject).toContain('RSVP reminder');
  expect(email.html).toContain('A gentle RSVP reminder');
  expect(email.html).not.toContain('<script>');
  expect(email.html).toContain('&lt;b&gt;Guest&lt;/b&gt;');
  expect(email.text).toContain('before it starts');
});
