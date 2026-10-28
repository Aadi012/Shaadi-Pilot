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

The dashboard already has its shell and tenant-scoped counts. It is partial:
upcoming-function details, assigned/overdue tasks, RSVP headcounts and nonempty
expense totals depend on their modules. Most planning, public-wedding and guest
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

Functions are the next planning module after the delivered Manager-removal slice.
Guest invitations/RSVP precede private gallery
capabilities; public website work depends on the function schedule. Tasks, expenses
and saved vendors can be reordered if priorities change.

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
