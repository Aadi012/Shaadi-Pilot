# Expense tracking — 30 October 2026

The user approved INR-only, editable/removable paid expenses and prioritized this
slice while Cloudflare R2 setup is pending. This resolves the original PRD versus
later API disagreement: amount/date edits are supported with version checks and
updatedBy provenance. Refund/reversal entries and budgets are outside this slice.

Use flat /api/v1/expenses GET/POST, /expenses/{expenseId} GET/PATCH/DELETE and
/expenses/summary GET. Inputs use title, amountMinor, currency INR, paidAt as an
explicit YYYY-MM-DD payment calendar date, optional category/notes/eventId.
UI rupees convert to decimal-string paise with BigInt; each positive entry fits
int64. Store exact paise strings and aggregate via Decimal128; JSON totals stay
strings and formatting uses BigInt, never floating-point currency arithmetic.

Every write uses current server membership, wedding context, CSRF and trusted
Origin. POST uses a durable user/wedding-scoped UUID receipt; matching retries
return the existing active record, changed payloads conflict, removed originals
cannot silently recreate. PATCH/DELETE require quoted If-Match. Removal archives
with actor/timestamps, excludes entries from totals and retains provenance.
Event references are checked inside the shared wedding-write transaction.

List is paginated 25 rows by creation identity, newest first, with category,
function and inclusive date filters. Cursors bind the applied filters and tenant.
Summary matches the complete filtered result, not just the displayed page;
overview uses all active wedding expenses. No duplicated monetary counters.

Apply npm run db:expenses:indexes explicitly in each environment before use.
The source date timestamp is deliberately a calendar date for this paid-expense
UX so the browser timezone cannot shift the payment date. Vendor references will
be introduced with Vendors, not accepted as unvalidated foreign identifiers now.

Stitch metadata lists four desktop/mobile expense overview/detail screens in
project 7444919587454097178. Visual export/inspection remains unverified; use the
existing shared brand/shell and honest real-data states. No fabricated totals,
refunds, pending balances, payment method schema or financial audit UI added.

Verify exact arithmetic above JavaScript safe integers, tenancy, Manager rights,
foreign events, stale/concurrent changes, retry receipts, removal/total changes,
HTTP guards and mobile/browser forms. Update project status with actual evidence.
