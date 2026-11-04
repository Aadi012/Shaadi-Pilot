# Incremental V1 delivery roadmap

Planning baseline: 27 October 2026. This orders existing PRD requirements; it
does not approve unresolved policies or claim generated designs are code.
Inspect the relevant finalized Stitch screens before each feature.

## Current position

The foundation, public marketing homepage, custom MongoDB-backed authentication,
wedding onboarding, initial overview and wedding-detail editing are implemented.
Password recovery has mocked delivery verification; its real email round trip is
still unverified. Manager invitation/revocation/acceptance is implemented and one
real email-to-acceptance flow succeeded. Admin removal of Managers is implemented;
see project status for its actual checks and boundaries.

29 October update: Functions, Tasks and Guest contacts were accepted and pushed to
dev. The first private invitation/RSVP slice is implemented locally for review: personal hub, explicit
issue/send/revoke/reissue, independent per-function responses and overview
headcounts. Contact selection alone never sends email or grants guest access.

The dashboard has tenant-scoped counts, upcoming functions, real task summaries,
exact expense totals and invitation headcounts. Populated browser verification
and the remaining modules are still required before release.
Most public-wedding and guest
media requirements are still ahead. No completion percentage has been measured.

## Delivery order

| Order | Feature                            | Small deliverable and dashboard impact                                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Finish organizer management        | Admin removal of Managers, prompt server-side access loss and direct API/tenant/concurrency tests. Keep Admin transfer and second-Admin policy separate. This closes the PRD removal requirement before assigning work to members.                                                                       |
| 2     | Wedding functions/events           | Create, list, edit and delete functions with description, date, start/end times, timezone and venue. Add chronological upcoming functions and real counts to overview. Finalize deletion/reference behavior first.                                                                                       |
| 3     | Tasks                              | Description, due date, same-wedding assignee, optional function, three statuses and filters. Add assigned/overdue/completion summaries. Define removed-assignee behavior.                                                                                                                                |
| 4     | Guest records and eligibility      | Invitee contacts and selected functions, editing, safe lists and removal. Add guest/contact counts. Resolve email requiredness and duplicates before implementation.                                                                                                                                     |
| 5     | Private guest invitations and RSVP | Accountless scoped links, per-function attendance/additional guest counts, revocation and truthful email status. Add RSVP/headcounts to overview. Follow with resend, manual WhatsApp sharing and organizer-triggered RSVP reminders using MongoDB batches. Resolve entry, transport, expiry and cutoff. |
| 6     | Expenses                           | Exact arithmetic, paid-expense CRUD, optional category/function and actual totals. Add overall/function spending to overview; no invented budget feature. Resolve currency and correction semantics.                                                                                                     |
| 7     | Vendors                            | Organizer-owned saved vendors, then Google Places category/location search and attribution. Keep provider data separate from organizer notes. No bookings/payments.                                                                                                                                      |
| 8     | Public wedding website             | Couple details, public function schedule, directions, 2–3 approved themes, basic text/images and publishing. Define public assets separately from private gallery media. Never expose guest/private data.                                                                                                |
| 9     | YouTube livestream                 | Validated YouTube URL/ID editing/removal and resilient public player. No video hosting infrastructure.                                                                                                                                                                                                   |
| 10    | Private gallery and personal QR    | Organizer/authorized guest uploads, R2 validation/completion, scoped view/download, removal and per-guest QR entry. Decide formats, quotas, retention and abuse controls first.                                                                                                                          |
| 11    | V1 integration and release         | Finish real dashboard aggregation; verify organizer/guest journeys, mobile/accessibility, email retries, secrets, retention, backups, monitoring and Vercel configuration. Deploy only when authorized.                                                                                                  |

Review the first private invitation/RSVP slice, then add organizer-triggered RSVP
reminders, manual WhatsApp sharing and bulk dispatch incrementally before moving
to Expenses. Gallery capabilities remain separate; public website work depends on
the function schedule. Expenses and saved vendors can be reordered if priorities
change.

## How each feature ships

1. Inspect actual Stitch references and affected PRD/API/database decisions.
2. Agree a narrow scope and resolve policies that block that feature.
3. Implement indexes, tenant-scoped persistence/services and thin REST handlers;
   then connect the responsive UI to real data.
4. Test authorization, tenancy, concurrency/retries where relevant, desktop/mobile,
   empty states and failures.
5. Run `npm run check`, isolated integration tests and `npm run build`.
6. Update project status and obtain user review. Commit/push only when authorized;
   proceed to the next small slice after review.

Update the relevant dashboard panel alongside each completed module. Do not build
every screen together or save dashboard integration until the end. Security and
tenant isolation accompany every slice.

## Near-term decisions

- Manager removal, then Functions is the user-authorized order. Review each slice
  before continuing to the next.
- Choose an owned sender domain when ready to invite other people. The current
  Resend test sender only supports account-owner testing.
- Keep the accepted invitation test wedding for now; remove its real membership
  only through an explicitly approved cleanup workflow.

Currency, guest email, guest-link lifecycle and gallery limits remain in the
architecture decision log. Decide them at their feature boundary.

29 October follow-up: function roster, reviewed individual RSVP reminders and
manual WhatsApp sharing are implemented locally for verification/review. Bulk
selection and dispatch remain the next invitation increment; then Expenses.

Gallery priority update — 29 October: user approved organizer gallery first, with
mocked R2 verification and explicit pilot quotas. Guest gallery access/uploads and
QR follow separately; Expenses, Vendors, public website and Livestream remain.

30 October: INR paid Expense Tracking implemented locally for verification while
R2 setup is pending. Vendors is the next independent planning module after review.

2 November: expense review corrections and automated checks pass. User authorized
commit/push of pending work. Recommended next slice is manually saved Vendors,
followed by Google Places discovery. Real R2 setup/verification, guest gallery
and personal QR, bulk invitation dispatch, public wedding website, YouTube
livestream and release verification remain. Dashboard panels should continue to
grow with their owning modules; there is no separate dashboard rewrite planned.

Vendor follow-up: the user approved manual saved contacts. Implementation is
under verification, including a real saved-vendor count/link on the overview.
Inspect milestone 17 for actual checks and pending setup; Google Places discovery
remains the next vendor increment.
