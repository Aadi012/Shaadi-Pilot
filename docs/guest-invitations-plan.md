# Private invitations and RSVP — 29 October 2026

The user authorized this feature after Guest contacts and approved one personal
invitation hub with a separate secure guest cookie. Gallery capabilities remain
separate. Link expiry is 30 days after the latest invited function ends; browser
sessions last at most seven days and never outlive the link. RSVP edits close at
the relevant function's start. Public publication does not control private access.

This resolves the PRD versus per-event-link contract in favor of the PRD hub:
one guestInvitationLinks capability authorizes only its explicitly issued
eventInvitations. Planned selections alone never authorize access. Link expiry is
fixed at issuance; moving an event does not silently prolong a bearer credential.
Reviewed reissue recalculates expiry and invalidates old links and sessions.

Deliver this incremental slice: review one contact's selected functions; issue a
personal invitation; copy or queue its email explicitly; inspect truthful provider
state; revoke all access; explicitly reissue after review; accountless per-function
RSVP and private per-function attendance summaries. Bulk dispatch, reminders,
per-function revocation controls, QR and gallery are subsequent slices. No real
email or existing membership/guest mutation is needed for automated verification.

Organizer contract: GET /api/v1/guest-contacts/{guestId}/invitation reads state;
POST issues reviewed selections with guestVersion and a UUID Idempotency-Key.
POST /send queues one immutable encrypted email with its own durable request key.
POST /share returns a private fragment URL after authorization and CSRF checks.
POST /revoke requires link If-Match. POST /rotate requires guestVersion, link
If-Match and a request key. Revocation preserves historical responses and revokes
all current pairs. Reissue activates only reviewed selections, preserves existing
responses and advances capability generation. Revoked invitations cease to block
contact identity/selection editing; gallery references remain fail-closed.

POST /send also requires the reviewed link's If-Match version. The client submits
the contact version actually shown in its review, rather than substituting a newer
version returned by an invitation-status refresh. If another organizer changes
selections, reopen/review contact details before issuing or reissuing.

Guest contract: POST /api/v1/guest/invitations/exchange accepts publicId/secret
from a fragment cleared before network activity, verifies anonymous/session CSRF
and trusted Origin, and issues a random HttpOnly host-only cookie. A hashed
guestInvitationSessions row binds link and generation. GET /current returns a
minimal greeting, explicitly invited functions and session CSRF. PUT /current/rsvp
requires Origin, guest CSRF, X-Guest-Context, invitation ID and strong If-Match.
Identical submissions are safe to repeat; conflicting stale changes require review.
POST /logout revokes only that guest session and clears its cookie.

Check live link generation, expiry, active wedding/contact/function and invitation
on every guest operation. Share/email secrets are encrypted with domain-separated
AES-GCM using the configured token key; validation stores SHA-256 only. Keep that
key available for active invitations: drain-only email key rotation is no longer
sufficient. No general keyring or silent fallback is introduced. Missing/wrong keys
fail closed; define reissue/rotation operations before production key replacement.

Cross-document writes serialize on the shared wedding write inside transactions.
Use compound unique pair/link and hashed-session indexes, explicit setup, strict
inputs, rate limits and private no-store/no-referrer/noindex pages and responses.
Do not log secrets, URLs or guest data. Reuse the existing Mongo email processor,
bounded leases, stable encrypted payloads and finite provider retry window. Check
current capability/recipient before dispatch; revocation cannot retract a provider
request already in flight. No claim of inbox delivery without provider evidence.

Additional guest counts accept every nonnegative JSON safe integer, with no product
cap; decline requires zero. Compute 1 + additionalGuests and aggregate attendance
exactly and return decimal strings for headcounts. Never expose other guests,
contact email/phone/internal notes, organizer data or gallery privileges to the hub.

Verify isolated Mongo transactions, tenant denial, shared-email separation,
idempotent issue/send/reissue, revocation and old sessions, RSVP cutoff and races,
exact count boundaries and real HTTP cookie/CSRF behavior. Record browser limits
honestly and run check/build before handoff. Release retention/purge and real
email-client fragment compatibility remain explicit launch work.

## Organizer reminder and roster increment — 29 October 2026

The next authorized increment adds GET /api/v1/events/{eventId}/invitations:
50 issued invitation records per page, a cursor bound to the wedding/function,
explicit active versus historical access, per-function response and exact party
size. Guest Directory hosts the function selector; its existing function option
pagination continues to populate the selector. Contact Details holds writes.

POST /api/v1/guest-contacts/{guestId}/invitation/remind requires trusted Origin,
session CSRF, wedding context, link If-Match, a durable UUID request key and an
empty body. Both organizer roles may review and queue one guest's reminder.
This first manual reminder includes all pending, not-yet-started functions on that
personal invitation. It neither creates eligibility nor resets responses. It is
not the source document's bulk event dispatch contract; bulk/dry-run targeting is
still later. Each new confirmed request is an intentional new email; matching
retries reuse the same delivery and immutable provider payload/key.

Reminder jobs have their own guest-reminder kind and targeted event IDs. Before
provider submission, every targeted function must still be pending, active and
upcoming, and the original capability must remain live. If any target changed,
cancel the complete immutable message; the organizer can review a fresh reminder.
Job expiry is the earliest targeted function start or link expiry. Provider calls
remain outside transactions. Reuse existing bounded leases/retries and the
secret-protected email drain; no external scheduler is provisioned by this change.

After explicitly retrieving a private link, a WhatsApp share action opens the
composer for the organizer to choose the recipient and send. It does not claim
that a message was sent. The personal link is a bearer credential and is shared
with WhatsApp only on that explicit action; use no-referrer and noopener links.
