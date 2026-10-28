# Manager invitations

Implemented 27 October 2026 as a narrow membership slice. The Admin Team page is
`/account/team`; private invitation entry is `/join`. Existing organizers are shown
with their role; only Admins can inspect recipient emails, invite or revoke.
Managers may read their own wedding's organizer roster through the API.

## Contract and lifecycle

- `GET /api/v1/members`: authenticated wedding organizers, 25 per page, ascending
  ObjectId cursor. Returns `members`, `nextCursor` and trusted `weddingId`.
- `GET /api/v1/member-invites`: Admin only, 25 per page, descending ObjectId cursor.
  Returns `invitations`, `nextCursor` and trusted `weddingId`. Mail status is scoped
  to the same wedding. Only a single optional `cursor` query parameter is accepted.
- `POST /api/v1/member-invites`: strict `{email}`, UUID `Idempotency-Key`, current
  `X-Wedding-Context`, session CSRF and trusted Origin. Role is always Manager;
  client roles and wedding selectors are rejected. New work returns 202; matching
  retries or an existing pending invitation return 200 without another email.
  Reusing a key for different details returns 409. Invalid schema/header values
  return the common 422 validation envelope. Missing mail setup returns 503 and
  rolls back the new invitation and request receipt.
- `POST /api/v1/member-invites/{inviteId}/revoke`: Admin, CSRF, Origin and expected
  wedding header. Foreign IDs return 404. Repeated revocation is safe; accepted
  invitations return 409. Revocation does not remove an existing organizer.
- `POST /api/v1/member-invites/context`: strict `{token}`, Origin and CSRF even
  when anonymous. Valid capabilities are staged in a 15-minute HttpOnly,
  SameSite=Lax, host-only cookie; Secure and `__Host-` prefix in production.
- `GET /api/v1/member-invites/context`: rate-limited safe view of staged context.
  Anonymous callers see only valid/invalid state; wrong accounts see only their
  own email. Couple names and invitation details require the matching account.
- `DELETE /api/v1/member-invites/context`: Origin/CSRF, clear temporary intent;
  does not revoke the invitation or remove membership.
- `POST /api/v1/member-invites/accept`: signed-in matching email, Origin/CSRF,
  strict `{invitationId}` and `X-Organizer-Context` matching the current account.
  Uses only the staged capability, not a caller-provided wedding or role. Explicit
  acceptance is required. Matching retries within capability validity are safe.

All responses use the existing request-ID/error envelope and private no-store
policy. Expected wedding/account headers are stale-tab workflow guards, never
authorization selectors. Server-side membership remains authoritative.

Invitations last seven days and store only a SHA-256 hash of a random 256-bit
secret. Links put the secret in the fragment, which the UI immediately removes.
The staged cookie carries intent through normal login/signup; login returns only
the fixed allowlisted `/join` or `/account` destination. No auto-acceptance, auto
login, email verification or account/password replacement is introduced. Reopen
the email link after the 15-minute context expires. Possession alone never grants
access: the current active account must match the invited normalized email.

Acceptance conditionally attaches an active, unjoined User as Manager and consumes
the invitation in one MongoDB transaction. A shared `Wedding.membershipVersion`
write serializes create/revoke/accept. Competing weddings also contend on the
User's null-membership conditional write. Future membership/lifecycle writers
must participate in the same wedding locking convention. Inactive weddings and
inviters invalidate outstanding invitations.

## Persistence and setup

Run `npm run db:membership:indexes` once per environment after the existing auth,
wedding and recovery index setup. The additive command was applied to development.
Runtime checks fail closed if required indexes are absent. Collections:

- `memberInvites`: wedding, normalized recipient, fixed role, inviter, token hash,
  pending/accepted/revoked/expired state, expiry, consumed/revoked timestamps and
  delivery reference. A partial unique wedding/email index allows one pending
  invitation; expired pending rows are transitioned before issuing another.
- `memberInviteRequests`: hashed user/wedding/request key, canonical payload hash,
  wedding and invitation reference. Durable receipts prevent duplicate emails
  after lost responses, including retries after revocation/expiry. No TTL is
  imposed; wedding/account deletion and retention remain release work.
- `users`: wedding/ID listing index and conditional Manager attachment; no second
  membership record or client-selected Admin assignment.
- `emailDeliveries`: extends existing jobs with `scope: wedding`, wedding ID and
  `kind: member-invite`. Batch encryption, stable provider keys, retry bounds and
  terminal ciphertext cleanup reuse the recovery foundation.

Invitations use the same private Resend/encryption settings documented in
[password recovery](password-recovery.md). Missing settings fail explicitly;
there is no fake production sender. Tests inject a mock sender and never contact
Resend. The UI retains entered email on failed creation.

On 27 October the user configured Resend, authorized one invitation to their own
mailbox, and confirmed receipt, acceptance and overview navigation. MongoDB checks
confirmed the accepted invitation and Manager role in the test wedding. The test
wedding remains intentionally available; no real membership was removed. The
configured `onboarding@resend.dev` sender is for account-owner testing, not general
customer sending. Verify an owned domain before inviting other recipients; see
[Resend testing restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Next `after` attempts newly queued work; the protected shared drain processes up
to two reset and three invitation jobs per invocation. No external scheduler is
configured. Invitation eligibility is checked before submission; already-revoked,
accepted or expired jobs are cancelled. A revoke racing with a provider request
cannot recall an email already in flight; the emailed link still enforces current
invitation state. Provider acceptance never proves inbox delivery.

Retain the encryption key until all pending work drains or expires, now up to
seven days for invites. There is no keyring. Live Resend delivery, fragment
preservation across supported real email clients, scheduler setup and monitoring remain release
requirements. Existing-member removal, role changes, second Admin, ownership
transfer and resend controls are outside this slice.

## Manager removal follow-up — 27 October 2026

The Admin Team roster now includes Remove only for Managers, with a native
confirmation naming the organizer and explaining the effects. Admin/self removal
and role changes remain unavailable. Cancel/Escape preserve membership; pending
actions disable duplicate submission. No real development membership was removed
during browser verification.

`DELETE /api/v1/members/{userId}` requires a fresh active Admin session, trusted
Origin, session CSRF, `X-Wedding-Context` and a strong quoted numeric `If-Match`
matching the target roster row's `membershipVersion`. No request body is accepted.
Empty content is valid even when Next.js supplies a non-null stream. The guard
reads to EOF or rejects the first nonempty chunk without buffering the full body;
whitespace and JSON payloads are both rejected. `npm run test:http` verifies this
through the running Next.js server, supplementing direct-handler tests.
Returns `{data: {removed: true}, meta}` on success. Missing precondition is 428,
malformed is 400, stale membership is 412, and foreign/already-removed IDs are 404.
Managers and Admin-target removals are denied with 403. Limit: 30 attempts per
actor per 15-minute window. All responses remain private/no-store.

One transaction acquires the shared wedding membership write, clears the target's
wedding/role, revokes every existing session and revokes pending/accepted
invitations for that email in this wedding. Account credentials and planning
records remain intact; other weddings' invitations are untouched. Old invite
links cannot restore access. A removed organizer may log in as unjoined and use a
new invitation to rejoin. No notification email or external provider call occurs.

User.membershipVersion advances on join and removal, independently of the
Wedding.membershipVersion serialization counter. Missing legacy values are zero;
no migration or new index is required. An old membership version cannot remove a
later rejoined membership. Repeat DELETE may safely return 404 or 412; clients
must refresh and review rather than silently retry with a newer version.

Previously rendered private content cannot be recalled from another browser tab.
Old sessions are rejected on subsequent requests; this does not cancel requests
already authorized in flight. Existing task assignments are retained;
former-assignee presentation/reassignment will be defined in the Tasks slice.
