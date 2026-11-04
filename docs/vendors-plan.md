# Saved vendor directory — 2 November 2026

The user approved manual Vendor Management as the next slice. VEN 03 is the
delivery boundary: name/category, optional phone/email/website/address/notes,
read/list/create/edit/remove for both organizer roles. Google Places discovery
and provider saving are a separate increment. No new dependency or service key.

Source inputs differ in detail: database/API documents mention optional status,
function associations and Places identifiers, while the PRD asks for a simple
contact list. These optional additions are deferred, not implemented as hidden
fields. The initial strict contract rejects them. Manual source is server-owned.
There is no booking, payment, vendor account, verification badge or commission.
No automatic deduplication by name or contact; distinct businesses may share
contacts. Durable request receipts deduplicate retries of the same create.

REST: /api/v1/vendors GET/POST and /vendors/{vendorId} GET/PATCH/DELETE.
List uses 25-row creation-ID pagination, literal case-insensitive name search and
exact category filtering. Cursor fingerprints bind tenant and normalized filters.
Total counts match all filtered records, not just the displayed page. Display
newest saved first. Vendor contacts/notes never enter public wedding DTOs.

Every write refreshes membership and requires Origin/CSRF/wedding context. Use
the shared wedding transaction lock, durable scoped UUID create receipts and
quoted If-Match for edits/removal. Foreign resources return 404, stale changes 412. Removal archives with actor/time/version and never deletes expense records.
No expense/vendor linking is exposed in this slice. Readiness requires explicit
vendor indexes, applied with npm run db:vendors:indexes after environment approval.

4 November review: render singular/plural vendor counts correctly. Each vendor
browser request, including its response-body read, has a 15-second deadline.
Session refresh and mutation are separate sequential requests. Timeout/connection
loss does not establish whether a write committed: preserve draft/create receipts
and offer Refresh directory and review after uncertain removal. Release the
write busy state after confirmed mutation without waiting for list refresh.
The user's original slow removal eventually succeeded; its server/network cause
was not established by the retained logs. No backend speedup is claimed.

Website inputs allow only HTTP(S) without embedded credentials. Links open with
noopener/noreferrer. Address is text, not an unvalidated map link. Server code
does not fetch websites or contact vendors. Phone and email actions are explicit.

Design references: inspected desktop 0c922a934f494c56a40f9ded7ebaf9cd and mobile
6eecac3be03248f88031c7bee0f11c2d in project 7444919587454097178, exported under
docs/designs/vendors. Keep the established heart brand, Newsreader/Manrope and
lavender/plum palette. Use two desktop columns and one mobile column, quiet
contact groups, category/source labels and team notes. Exclude prototype tabs,
fabricated counts/fees, directory-verified claims, offline sync, concierge copy,
and discovery controls until the corresponding capability exists.

Verification targets: tenancy/roles/archived wedding, literal search, pagination,
version races, membership removal, retry after ambiguous outcomes, rejected
input correction, archive provenance and preserved expenses. Browser checks
must distinguish real data from temporary test fixtures and preserve user data.
