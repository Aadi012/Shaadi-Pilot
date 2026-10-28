# Guest records and function selection — 28 October 2026

User authorized the next roadmap slice after Tasks. Both roles manage primary
invitee contacts; guests do not have accounts. Required display name and email;
optional phone and internal notes. Shared family emails are allowed with a
warning, never silently merged. These two policies were explicitly approved.

This slice delivers contact create/read/edit/archive, private search/filtering,
duplicate warnings and selected functions. Selection is planning intent stored as
selectedEventIds on the contact, not an invitation, RSVP or access capability.
The invitation slice will explicitly create invitations from reviewed selections;
it must not infer that a saved selection authorizes a guest. No email is sent here.

Use /api/v1/guest-contacts and /api/v1/guest-contacts/{guestId}, UUID create keys,
strong version preconditions, Origin/CSRF, fresh membership, expected-wedding guard
and wedding-scoped references. Writes serialize through the shared wedding lock,
including function-reference validation. Archive preserves history. Existing
private invitation/gallery references block removal or identity/selection changes
until their owning modules implement transactional revocation; fail closed rather
than silently leaving access active. Notes/name edits do not change capabilities.

Queries use bounded cursor pages, literal name/email search, optional event filter
and duplicate-email warnings. Cursors bind tenant and filters. Do not expose
duplicate contact identities outside this wedding or log contact data. Counters
describe contacts and selected functions, never confirmed attendance.

Add focused unit, isolated integration and real-HTTP tests for roles, tenancy,
concurrent retries/updates, foreign and archived functions, duplicate emails,
archive safety and cursor search. Inspect approved desktop/mobile references.
Run check/build and record actual browser evidence and limitations in status.

## API details

Contact input: displayName (1–160 characters), email (required, normalized lower
case, at most 254), optional phone (40), internal notes (2,000), selectedEventIds
(distinct active same-wedding IDs, bounded to 100 per request). PATCH accepts a
nonempty subset. No client tenant, role, RSVP, verification or dispatch fields.
Server-owned archive timestamp, version and createdBy/updatedBy preserve lineage.

GET filters: literal substring search on name/email (160 characters), eventId,
limit 1–100 (default 25), cursor. Lists sort descending ID and return private DTOs,
duplicateEmail flags, scoped contact summary and nextCursor. Duplicate warnings
are authoritative on save/read across active wedding contacts; the form's early
warning is advisory from loaded contacts. Shared email never identifies a guest
or grants access. The future invitation module must retain contact-specific keys.

POST requires UUID Idempotency-Key; the transaction stores request hash and record
ID. Matching retries reproject current state; archived originals conflict. PATCH
and DELETE require a strong quoted numeric If-Match. DELETE accepts empty content
and archives; archived contact selections still block function removal under the
approved no-cleanup policy. Existing capability records fail closed as above.

Run npm run db:guests:indexes per environment. Search is literal, bounded and has
a database time limit; no text-search provider or new service is introduced.
