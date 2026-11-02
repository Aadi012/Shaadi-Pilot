# Organizer gallery — implementation plan

Started 29 October 2026. Status: In progress — implemented locally for review; real R2 verification pending.

The user authorized Gallery before Expenses, beginning with organizer uploads and
private viewing. Guest gallery capabilities, guest uploads and personal QR codes
follow as separate increments. Admin and Manager share organizer gallery rights.

## Approved pilot decisions

The source documents mark formats, size, quotas and moderation provisional.
Approved by the user on 29 October 2026: JPEG/PNG/WebP, 20 MiB per file, 1,000 photos and 5 GiB per
wedding; decode/validate bounded image dimensions and strip metadata before ready.
The user approved mocked storage verification first. No R2 configuration or live
bucket writes are required for tests; the real application fails closed without it.
Guest token lifetime, moderation and final retention remain future decisions.

## Contract and security

Use flat tenant-relative /api/v1/gallery/photos, /gallery/uploads and
/gallery/uploads/{photoId}/complete, following the API document rather than the
system design's nested wedding routes. Derive tenant from fresh organizer state.
Browser writes require Origin, CSRF and wedding context; reserve quotas and
create durable upload receipts transactionally. Validate optional event references.

Browser uploads go directly to a short-lived R2 staging PUT URL. Do not proxy the
original photo through Vercel or trust client MIME/HEAD alone. At completion,
recheck membership, read bounded actual bytes, fully decode the supported image,
apply pixel/byte limits, strip private metadata and write to a different immutable
final key. A still-valid staging PUT must never replace a ready image. Reconcile
abandoned staging and pending completion work without provider calls inside DB
transactions. Keep random object keys and provider credentials server-only.

List only authorized private metadata and short-lived view URLs; no public bucket,
public Next.js image cache or credential logging. Removed membership prevents new
authorization; existing signed URLs remain usable until short expiry. Every media
reference and request cursor must be wedding-scoped. Store image bytes in R2 only.

## Design and verification

Stitch lists the desktop Private Gallery & Media Vault screen
c309a8ac0f0f48b1b6b660633666cfef in project 7444919587454097178. Its metadata was
retrieved, but the authenticated screenshot export fallback failed; visual
inspection is not claimed. Preserve the established brand, palette and fonts.
Exclude unapproved AI, face recognition, budgets, generated metrics and sharing
rights outside this first organizer slice.

Tests must cover actual byte validation, quota reservations under concurrency,
foreign photo/event IDs, removed organizers, duplicate intent/completion retries,
provider failures and immutable-final protection. Run check/build and isolated
integration/HTTP tests, then browser upload/view on desktop/mobile where possible.
No storage service configuration, live bucket writes, real user photo uploads,
commits, pushes or deployments have been performed.

## Implemented lifecycle and operational setup

Upload intents have five-minute signed PUT access and a fifteen-minute completion
window. A 20 MiB reservation per unfinished upload covers maximum sanitized output.
Ready images count actual cleaned bytes; rejected/deleting/abandoned uploads retain
reservations until cleanup succeeds. Gallery limits are configurable using
GALLERY_MAX_PHOTOS and GALLERY_MAX_BYTES, defaulting to the approved pilot values.
Image processing rejects animation, dimensions above 16,000 on either side, or
more than 40 megapixels; at most two images decode concurrently per process with
a 20-second processing timeout. Originals are re-encoded to WebP without metadata.
The original is not offered for download. Signing binds Content-Type and exact
Content-Length; real-browser/R2 compatibility remains a required smoke test.

New Node REST handlers implement the flat source API and GET
/gallery/photos/{photoId}/view for explicit private one-minute viewing URLs.
List DTOs exclude keys and URLs. Requests use durable UUID receipts; immutable
final keys include sanitized content hashes. Completion uses expiring ownership
leases; failed provider calls return to a retryable pending state, while invalid
bytes become rejected. Membership is checked before work and before ready commit.

Removal hides a photo from new viewing authorization and queues deletion. The
protected GET /api/internal/cron/photos requires CRON_SECRET and reconciles at most
ten records per invocation. Cleanup waits beyond upload/processing leases to
avoid late original PUT resurrection, removes staged/losing final objects, and
retains durable deleting state on provider failure. Ready final objects survive
staging cleanup. Cleanup does not call R2 inside database transactions.

Apply npm run db:gallery:indexes explicitly per environment before enabling.
Provision invocation of the cleanup route before production use; this change does
not configure an external scheduler. No automatic age-based photo retention has
been approved; retained photos persist until removal. Wedding deletion and account
retention/purge policy remain release work. Existing short-lived GET links can
remain usable for at most one minute after removal or membership revocation.
