# Manager invitations — first slice

Started 27 October 2026 after the user authorized the next feature. Status:
implemented and verified, including one user-confirmed real email-to-acceptance
flow. See [delivered contract](organizer-invitations.md) and project status for
actual checks and remaining release work. The plan below preserves the original
implementation sequence; its proposed defaults are recorded in the decisions log.

## Scope

Admin team page, organizer list, Manager-only invitation form, pending invitations,
revocation and account-bound acceptance. Public guests and guest invitations are
separate features. Member removal, second-Admin invitation, role changes and
ownership transfer remain later decisions and work.

Follow the [Stitch brief](designs/organizer-invitations-prompt.md), then review the
generated screens before implementing UI. The existing approved design language
is in DESIGN.md. Do not infer a design exists merely from this brief.

## Proposed implementation order

1. Review desktop/mobile Team, invitation form, revoke confirmation, join states
   and transactional-email reference. Align generated controls with this slice.
2. Finalize the narrow contract: fixed Manager role, seven-day invitation expiry,
   normalized email match, pending-invite deduplication and explicit acceptance.
   Seven days is the proposed default for this new slice, not a historical policy.
3. Add a membership module with module-owned Mongoose persistence and services;
   use existing auth services for identity instead of exposing auth repositories.
   Store invite secret hashes, not raw validation tokens, and use explicit indexes.
4. Implement the API document's `/api/v1/members`, `/member-invites`,
   `/member-invites/{inviteId}/revoke` and `/member-invites/accept` contracts only
   as needed for this slice. Any public token inspection/context endpoint must
   be narrow, rate-limited and documented before implementation.
5. Creation atomically persists invitation plus encrypted email work; durable
   idempotency suppresses duplicate invitations/emails. Extend the reset-only
   delivery foundation with wedding-scoped invitation eligibility rather than
   creating a second mail system. Retries must retain immutable payload identity.
6. Acceptance must consume the invitation and conditionally attach a matching,
   active, unjoined user in one transaction. Serialize revoke/accept and wedding
   lifecycle changes through an appropriate shared wedding write. An invitation
   never bypasses password authentication or grants a client-selected role.
7. Preserve invitation intent through login/signup using a short-lived, private
   flow. Validate any return destination as a fixed local route. Keep raw secrets
   out of query strings, return URLs, storage exposed to scripts and logs. Choose
   and test the precise context transport before coding the navigation flow.
8. Wire the approved UI, enable Admin Team navigation, show truthful mail state,
   and update overview guidance. Retain the newly added draft-wedding guard when
   sessions/membership change across tabs. Do not auto-accept an invitation.
9. Run isolated transaction/concurrency tests, browser checks, project checks and
   production build; update project status before handoff.

## Verification targets

- Manager cannot create/revoke invitations or administer members, including direct
  API calls. Every organizer query derives its wedding from current membership.
- Pending invitations and mail state never leak across weddings. Public inspection
  reveals only the minimum permitted by a valid unexpired capability.
- Wrong email, disabled user, expired/revoked token, inactive wedding, unknown role
  and already joined elsewhere all fail without changing membership.
- Repeated or simultaneous acceptance creates one membership. Concurrent invitations
  to different weddings cannot attach one organizer to both. Revoke versus accept
  has one valid serialized outcome; lost responses have documented safe retries.
- Duplicate invite requests do not produce duplicate pending invitations or email.
  Recipient removal/revocation/expiry is rechecked before queued mail is submitted.
- A pre-registered email still requires the real account password or normal password
  recovery; invitation possession never replaces credentials or a recovery link.
- Refresh, account switching and login return preserve the intended invitation
  safely. Mobile and keyboard flows work without misleading success states.

## Boundaries

No new infrastructure or dependencies were added. Automated tests use mocked
delivery. The user later configured Resend and authorized one real invitation;
they confirmed receipt, acceptance and overview navigation. No production
scheduler was configured. Existing-member removal remains a separate slice.
