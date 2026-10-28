# Wedding Planning Platform Database Design

> Converted from the [original Word document](source/database-design.docx). Wording and provisional decisions are preserved; approved implementation decisions are tracked in [architecture-decisions.md](architecture-decisions.md).

Version 1.0 · 24 October 2026 · MongoDB Atlas and Mongoose

Implementation addendum, 27 October 2026: Manager invitations add module-owned
`memberInvites` and durable `memberInviteRequests`, unique hashed capabilities,
one pending invitation per wedding/email, wedding-scoped list indexes and
`Wedding.membershipVersion` for transactional serialization. Existing email jobs
now include wedding-scoped `member-invite` work; User attachment is conditional on
null membership and fixes the role to Manager. See the
[implemented persistence/setup contract](organizer-invitations.md#persistence-and-setup).
The original broader schema below remains architectural input; unsupported Admin
changes and member-removal operations are not silently claimed implemented.

This document defines the persistence contract for the agreed TypeScript modular monolith. It specifies collection responsibilities, document fields, indexes, transactional invariants, token storage, and the failure paths that the database must support. The working product name can change without affecting the schema.

## 1 Architecture decisions

| Concern            | Decision                                          | Consequence                                  |
| ------------------ | ------------------------------------------------- | -------------------------------------------- |
| Tenant boundary    | One Wedding ObjectId                              | Every wedding-owned record carries weddingId |
| Storage layout     | Single MongoDB Atlas database, shared collections | No database or collection per wedding        |
| Organizer identity | One User belongs to zero or one wedding           | User has nullable weddingId and role         |
| Organizer roles    | Admin and Manager                                 | Role check at API service boundary           |
| Guest identity     | GuestContact without a login                      | No password or member role for guests        |
| Invitations        | Invitation per guest contact and event            | RSVP and access scoped to a function         |
| Gallery            | One personal gallery QR capability per contact    | Gallery access is independent of RSVP token  |
| Expenses           | Actual ledger only                                | No budgets or budget-allocation records      |
| Media              | Cloudflare R2 object data; MongoDB metadata       | Never store image bytes in MongoDB           |
| Email              | MongoDB email work records                        | No Redis, BullMQ or separate worker in V1    |

These constraints are domain invariants, not client-side UI assumptions. A request with a valid organizer session must still be denied if it references a resource belonging to a different wedding.

### Non-goals

V1 excludes a general multi-tenant organization membership join table, named accompanying-guest rows, guest authentication accounts, an audit event platform, budget allocation models, payment gateway data, and a separate message broker.

## 2 Collection relationships

| Parent       | Child                        | Cardinality           | Constraint                                         |
| ------------ | ---------------------------- | --------------------- | -------------------------------------------------- |
| Wedding      | User                         | One to many           | User belongs to no more than one wedding           |
| Wedding      | Event                        | One to many           | Every event has a single weddingId                 |
| Wedding      | Task, Expense, Vendor        | One to many           | Nested referenced IDs must belong to same wedding  |
| Wedding      | GuestContact                 | One to many           | One representative may stand for a whole family    |
| GuestContact | EventInvitation              | One to many           | Unique guest and event pair                        |
| Event        | EventInvitation              | One to many           | RSVP is per function                               |
| GuestContact | GalleryToken                 | One active capability | One re-usable wedding photo QR link                |
| Wedding      | Photo                        | One to many           | ObjectKey maps to a private R2 object              |
| Wedding      | EmailDelivery and EmailBatch | One to many           | Email work remains wedding-scoped where applicable |

MongoDB does not enforce these relationships as foreign keys. The service layer validates wedding ownership for each reference before writing it. Platform-level authentication emails and sessions can exist while the User has no wedding.

## 3 Collection catalog

Manager-removal addendum (27 October): `User.membershipVersion` is an independent
join/removal generation counter, treating legacy absence as zero. Clearing a
Manager's wedding/role, revoking their sessions and invalidating this wedding's
pending/accepted organizer invitations commit together under the shared wedding
membership lock. Accounts and planning records remain. No new collections or
indexes are required; see [removal contract](organizer-invitations.md#manager-removal-follow-up--27-october-2026).

| Collection          | Role                                        | Main access pattern            |
| ------------------- | ------------------------------------------- | ------------------------------ |
| weddings            | Tenant root and public website settings     | id, slug                       |
| users               | Organizer identity and membership           | emailNormalized, weddingId     |
| sessions            | Session-token hashes                        | tokenHash, expiresAt           |
| memberInvites       | Inviting organizer accounts                 | tokenHash, weddingId and email |
| passwordResetTokens | Single-use account recovery                 | tokenHash, userId              |
| events              | Wedding functions and venues                | weddingId and startsAt         |
| tasks               | Planning items and assignments              | weddingId, assignee, status    |
| expenses            | Actual payments and refunds                 | weddingId, paidAt              |
| vendors             | Saved vendor contacts and Places references | weddingId and category         |
| guestContacts       | Named invitees or family representatives    | weddingId and email            |
| eventInvitations    | Per-function invitation and RSVP            | eventId and guestContactId     |
| galleryTokens       | Guest-specific gallery links and QR codes   | tokenHash, guestContactId      |
| photos              | R2 photo metadata and upload state          | weddingId and state            |
| emailDeliveries     | Durable send and retry work                 | state and nextAttemptAt        |
| emailBatches        | Resend batch idempotency and outcomes       | idempotencyKey                 |

## 4 Detailed document designs

All domain collections have _id, createdAt and updatedAt. ObjectId references are not embedded copies of entire documents. Treat user-entered strings as untrusted.

### 4.1 weddings

| Field           | Type                       | Rule                                                                   |
| --------------- | -------------------------- | ---------------------------------------------------------------------- |
| _id             | ObjectId                   | Permanent tenant identifier                                            |
| slug            | string                     | Lowercase, globally unique, stable                                     |
| displayNames    | embedded object            | Couple display names and optional intro                                |
| timezone        | string                     | Valid IANA timezone, e.g. Asia/Kolkata                                 |
| weddingDate     | YYYY-MM-DD string          | Main ceremony calendar date; validated independently of UTC timestamps |
| defaultLocation | Venue object or null       | Venue name, address, GeoJSON, Google Place ID                          |
| websiteTheme    | enum                       | One of three V1 theme IDs                                              |
| isPublished     | boolean                    | Controls public homepage and event visibility                          |
| youtubeLiveId   | string or null             | Validate ID; do not store arbitrary iframe HTML                        |
| status          | active, archived, deleting | Archived/deleting denies guest access                                  |
| createdBy       | User ObjectId              | First Admin                                                            |

Return public wedding data through a dedicated projection, never by serializing the whole wedding document. Published event schedule and homepage are public; private RSVPs, guest emails and expenses are not.

The approved 25 October onboarding slice stores manually entered location in
`defaultLocation.name`, leaves publication false and defers website theme selection.
`weddingCreations` stores a SHA-256 user/key-scoped `_id`, normalized request hash,
userId and weddingId in the same transaction as wedding creation and first-Admin
membership. Keep receipts for safe retries; lifecycle deletion must clean them up.

### 4.2 users

| Field           | Type                   | Rule                                  |
| --------------- | ---------------------- | ------------------------------------- |
| emailNormalized | string                 | Unique after trim and lowercase       |
| displayName     | string                 | Organizer's name                      |
| passwordHash    | string                 | Argon2id verifier, never plaintext    |
| weddingId       | ObjectId or null       | At most one wedding                   |
| role            | admin, manager or null | Null if no wedding                    |
| status          | active or disabled     | Disabled accounts cannot use sessions |
| lastLoginAt     | Date or null           | Optional                              |

V1 does not require email verification during signup or wedding invite acceptance. Validate email syntax, but do not invent an emailVerified=true state. A unique normalized email can be registered by somebody who does not own that inbox; secure email-password recovery and token-bound membership are essential.

### 4.3 sessions, memberInvites and passwordResetTokens

| Collection          | Fields                                                                                          | Lifetime and invariant                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| sessions            | userId, tokenHash, createdAt, lastSeenAt, expiresAt, revokedAt                                  | Hash of opaque session secret; expiration checked on request and TTL cleanup                |
| memberInvites       | weddingId, emailNormalized, invitedRole, invitedBy, tokenHash, expiresAt, consumedAt, revokedAt | High-entropy single-use link; validate account email equals target and consume atomically   |
| passwordResetTokens | userId, tokenHash, expiresAt, usedAt, createdAt                                                 | Single-use short-lived secret; rate-limit requests and revoke existing sessions after reset |

Member invitation possession does not prove mailbox ownership if a link is forwarded. It grants only the invited role in the invited wedding. A user already joined to another wedding gets a conflict, and the last Admin cannot be removed.

### 4.4 events

| Field               | Type           | Rule                                                 |
| ------------------- | -------------- | ---------------------------------------------------- |
| weddingId           | ObjectId       | Required tenant key                                  |
| title               | string         | Example Sangeet, Haldi, Wedding                      |
| startsAt and endsAt | UTC BSON Date  | End later than start                                 |
| timezone            | string         | Defaults to wedding timezone                         |
| venue               | embedded Venue | Event may override wedding location                  |
| isPublished         | boolean        | Schedule visibility only, not invitation permissions |
| sortOrder           | integer        | Stable event ordering                                |

Use an embedded venue because venue details are read with an event, while Vendors remain an independent collection. The geographic point uses GeoJSON coordinates [longitude, latitude], never [latitude, longitude].

### 4.5 tasks and expenses

| Collection | Fields                                                                                                         | Domain constraints                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| tasks      | weddingId, eventId?, title, description?, assignedToUserId?, status, dueAt?, createdBy, updatedBy              | Status todo, inProgress, done; assignee must belong to wedding; unassigned valid     |
| expenses   | weddingId, eventId?, vendorId?, title, category?, entryType, amountMinor, currency, paidAt, recordedBy, notes? | Positive 64-bit integer amountMinor; entryType expense or refund; currency INR in V1 |

Expense totals are calculated as sum(expense amounts) minus sum(refund amounts). Never use JS floating-point currency values. A correction should preserve provenance: edit with updatedBy or use a reversing/refund record depending on the product UX. No budget documents or percentage allocations exist.

### 4.6 vendors

| Field             | Type                           | Rule                                   |
| ----------------- | ------------------------------ | -------------------------------------- |
| weddingId         | ObjectId                       | Required                               |
| name and category | strings                        | Photographer, caterer, decorator, etc. |
| googlePlaceId     | string or null                 | For discovered vendors                 |
| phone and website | strings or null                | Sanitized contact data                 |
| location          | Venue or GeoJSON               | Optional                               |
| eventIds          | ObjectId array                 | Each event must belong to same wedding |
| status            | shortlisted, booked, cancelled | Optional V1 categorization             |
| notes             | string                         | Organizer-visible                      |

Google Places results are not blindly copied into MongoDB. Store only user-saved vendor details and a provider ID where available. Manual vendors may have no Google Place ID.

### 4.7 guestContacts and eventInvitations

| Collection       | Fields                                                                                                                                                       | Domain constraints                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| guestContacts    | weddingId, displayName, emailNormalized, phone?, notes?, archivedAt?                                                                                         | Contact is one representative for a family; does not have a User role |
| eventInvitations | weddingId, eventId, guestContactId, tokenHash, tokenCiphertext, tokenKeyId, tokenExpiresAt?, revokedAt?, rsvpStatus, additionalGuests, respondedAt?, sentAt? | Unique wedding/event/guest; status pending, attending, declined       |

RSVP is per event. If attending, confirmed headcount for that invitation is 1 + additionalGuests. If declined or pending, confirmed headcount is zero. The additionalGuests value must be a nonnegative safe integer, with no product-defined maximum or couple approval. Reject NaN, fractions, negatives and values beyond the integer representation. Repeat PUT submissions are idempotent when the payload is identical.

The same guestContact may have separate eventInvitations for Sangeet and Wedding. It must not receive access to one RSVP merely by holding another event's token.

### 4.8 galleryTokens and photos

| Collection    | Fields                                                                                                                           | Domain constraints                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| galleryTokens | weddingId, guestContactId, tokenHash, tokenCiphertext, tokenKeyId, expiresAt?, revokedAt?, lastUsedAt?                           | One current personal QR/link per guest; wedding-level view and upload scope |
| photos        | weddingId, eventId?, objectKey, originalName?, mimeType, sizeBytes, uploadedByType, uploadedById, state, verifiedAt?, deletedAt? | States pending, ready, rejected, deleting, deleted; never store image bytes |

Photo object keys are random and wedding-prefixed, such as weddings/WEDDING_ID/photos/RANDOM_ID.jpg. The bucket stays private. Presigned PUT URLs are short-lived and scoped to one key. An upload completion endpoint checks the R2 object exists and verifies size and supported file type before setting state ready. Pending records and orphaned objects are periodically reconciled.

The gallery QR can be printed and used repeatedly until expiry or revocation. Because guests do not log in, it is a bearer link: forwarding it transfers access. The link is not an identity proof.

### 4.9 emailDeliveries and emailBatches

26 October implementation slice: platform password resets add User
`credentialVersion` (legacy default 0) and a `recoverySequence` write counter to
serialize credential-sensitive transactions. `passwordResetTokens` also stores
the credential version at issuance. Validation uses tokenHash; consumed or expired
records never authorize a reset even before TTL cleanup.

Reset emailDeliveries hold scope/kind, userId, tokenHash, logicalKey, state,
attempts, nextAttemptAt, leaseUntil/leaseOwner, firstAttemptAt, expiresAt, purgeAt
and optional safe provider metadata. They contain no raw token or recipient.
Each has one emailBatch with the same ObjectId, unique idempotencyKey,
payloadHash, encrypted payload and expiresAt. The batch payload contains the
recipient and link under authenticated encryption. It is immutable on retry and
erased on terminal processing; batch TTL removes it at the reset deadline.
Delivery metadata TTL is seven days after that deadline. Current states add
cancelled/quarantined for ineligible work and ambiguous/conflicting outcomes.
This is a low-volume reset-only delivery slice; the broader proposed batch fields
and wedding mail projections below remain future contracts.

| Collection      | Fields                                                                                                                                   | Domain constraints                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| emailDeliveries | scope, weddingId?, logicalKey, recipient, kind, subjectData, state, nextAttemptAt, leaseUntil?, attempts, providerMessageId?, lastError? | State pending, leased, retry, submitted, failed; unique logicalKey |
| emailBatches    | weddingId?, idempotencyKey, deliveryIds, state, providerIds?, submittedAt?, lastError?                                                   | Unique idempotency key; same batch payload on safe retry           |

The scope distinguishes wedding invitation/reminder messages from platform password-reset email, which can exist before wedding membership. Do not expose platform-scoped mail rows through wedding endpoints.

Use MongoDB records as a lightweight work queue. A Vercel Cron invocation claims due deliveries with atomic updates and expiring leases, sends up to 25–50 with Resend, and records each provider response. A timeout or duplicate Cron invocation is managed with stable idempotency keys, atomic claims, and retry reconciliation; exactly-once delivery cannot be guaranteed indefinitely. Resend documents a 24-hour idempotency retention window. A request with ambiguous acknowledgement after that window requires review rather than an automatic blind resend. Submitted means accepted by Resend, not delivered to an inbox; delivery webhooks are out of V1.

Deployment implication: Vercel's Hobby plan currently limits scheduled Cron runs to once per day, whereas Pro supports per-minute Cron. For timely invitation and reminder dispatch, use a Pro plan or explicitly accept daily-batch latency; don't promise near-real-time sending on Hobby.

## 5 Data types and reusable embedded objects

| Convention          | Storage                                | Why                                          |
| ------------------- | -------------------------------------- | -------------------------------------------- |
| Tenant ID           | ObjectId weddingId                     | Simple common authorization and index prefix |
| Audit timestamps    | BSON UTC Dates                         | Stable range queries and ordering            |
| Display timezone    | IANA string                            | Correct multi-function local time rendering  |
| Money               | BSON Long/int64 of paise               | Exact arithmetic                             |
| Location            | GeoJSON Point [longitude, latitude]    | Correct 2dsphere semantics                   |
| Enums               | String enum in Mongoose and API schema | Stable validation                            |
| Optional references | ObjectId or null                       | No empty-string pseudo IDs                   |
| Concurrency         | __v or expected version filter         | Detect competing writes                      |

Example event venue payload:

```json
{
  "name": "Sample Wedding Hall",
  "address": {"city": "Jaipur", "state": "Rajasthan", "country": "IN"},
  "geo": {"type": "Point", "coordinates": [75.78, 26.91]},
  "googlePlaceId": "optional"
}
```

Validate latitude -90 through 90 and longitude -180 through 180. Google Places requests use these coordinates but should not define the source of truth for a manually-entered venue.

## 6 Index specification

| Collection          | Index                                                                  | Purpose                                |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| users               | emailNormalized unique; (weddingId, role)                              | Login and member list                  |
| sessions            | tokenHash unique; expiresAt TTL                                        | Session lookup and cleanup             |
| weddings            | slug unique                                                            | Public wedding path                    |
| memberInvites       | tokenHash unique; (weddingId, emailNormalized)                         | Join and pending invite list           |
| passwordResetTokens | tokenHash unique; (userId, expiresAt)                                  | Account recovery lookup and cleanup    |
| events              | (weddingId, startsAt, _id)                                             | Schedule sorting                       |
| tasks               | (weddingId, status, dueAt); (weddingId, assignedToUserId)              | Dashboard filters                      |
| expenses            | (weddingId, paidAt desc); (weddingId, eventId)                         | Ledger and function totals             |
| vendors             | (weddingId, category, name); partial unique (weddingId, googlePlaceId) | Category and saved-place deduplication |
| guestContacts       | (weddingId, emailNormalized)                                           | Guest lookup, nonunique pending policy |
| eventInvitations    | unique (weddingId, eventId, guestContactId); tokenHash unique          | RSVP uniqueness and capability lookup  |
| galleryTokens       | unique (weddingId, guestContactId); tokenHash unique                   | One current QR and token lookup        |
| photos              | objectKey unique; (weddingId, state, createdAt desc)                   | Gallery lists and object cleanup       |
| emailDeliveries     | logicalKey unique; (state, nextAttemptAt, leaseUntil)                  | Idempotency and due work               |
| emailBatches        | idempotencyKey unique; (weddingId, createdAt desc)                     | Provider retry audit                   |

Representative index DDL:

```javascript
db.eventInvitations.createIndex(
  { weddingId: 1, eventId: 1, guestContactId: 1 }, { unique: true }
);
db.vendors.createIndex({ weddingId: 1, googlePlaceId: 1 }, {
  unique: true,
  partialFilterExpression: { googlePlaceId: { $type: "string" } }
});
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.emailDeliveries.createIndex({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
```

The partial vendor index excludes manual records without a place ID. MongoDB TTL deletion is asynchronous, so authorization checks expiry on every access rather than relying on physical deletion. Apply indexes through migrations and disable Mongoose autoIndex in production.

## 7 Mongoose model conventions

Representative Event schema fragment:

```typescript
import { Schema, model, models } from "mongoose";

const EventSchema = new Schema({
  weddingId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  isPublished: { type: Boolean, default: true }
}, { timestamps: true, strict: "throw", optimisticConcurrency: true });

EventSchema.index({ weddingId: 1, startsAt: 1, _id: 1 });
export const Event = models.Event || model("Event", EventSchema);
```

Schema validation is only the first layer. Services enforce endsAt > startsAt, valid guest and user membership, no last-Admin removal, token state, and same-wedding references. Avoid allowing arbitrary client-provided nested updates or unchecked $set payloads.

### Tenant-scoped mutation

```typescript
const filter = { _id: taskId, weddingId: session.weddingId };
const updated = await Task.findOneAndUpdate(
  filter,
  { $set: { status: input.status, updatedBy: session.userId } },
  { new: true, runValidators: true }
);
if (!updated) throw notFound();
```

The weddingId must come from a validated organizer session, never from the JSON body. For conflict-sensitive writes, include an expected __v in the filter and increment it atomically. Mongoose optimisticConcurrency on document save does not automatically protect every findOneAndUpdate call.

## 8 Secure token storage and regeneration

One subtle requirement needs explicit handling: if only a hash of a guest invitation token is stored, the server cannot reconstruct that same RSVP URL for a reminder. Similarly, an organizer needs to reprint an existing personal QR without invalidating the copy guests already have.

For long-lived RSVP and gallery capabilities, the proposed solution is:

1. Generate a random 256-bit token and an independent lookup identifier.

2. Store tokenHash for indexed validation and a separately encrypted tokenCiphertext for authorized resend or QR regeneration.

3. Encrypt with AES-256-GCM using a server-only key, unique nonce, and a tokenKeyId for rotation. The database never contains plaintext secrets.

4. Validate token purpose, wedding, event or guest scope, expiry and revokedAt before any data access.

5. On first visit, optionally exchange the URL capability for a short-lived scoped cookie and clear the raw secret from browser history.

6. Rotate or revoke compromised tokens and invalidate any derived guest cookies.

Single-use member-join and password-reset links can be regenerated rather than storing decryptable copies. Avoid logging tokens in request paths, query strings, Resend error payloads, or application traces. Set Referrer-Policy to no-referrer on token landing pages.

## 9 Transactions and failure semantics

| Operation               | Database atomicity                                                    | External or retry behavior                                                                    |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Create first wedding    | Transaction: insert wedding and attach User only if weddingId is null | Client idempotency key prevents duplicate wedding                                             |
| Accept member invite    | Transaction: mark invite consumed and assign unjoined User            | Expired or duplicate acceptance fails safely                                                  |
| Create event invitation | Transaction if creating RSVP capability and emailDelivery together    | Compound unique index handles races                                                           |
| Edit RSVP               | One conditional update on the eventInvitation                         | Identical PUT is idempotent; last accepted edit wins                                          |
| Upload photo            | Create pending record, R2 PUT, verify object, set ready               | Failed uploads remain pending for cleanup                                                     |
| Send email              | Lease Mongo work, call Resend, write provider status                  | Retry with stable batch idempotency key inside provider's 24h window; reconcile ambiguous ack |
| Delete photo            | Mark deleting; delete R2 object; mark deleted                         | Cleanup job retries failed object deletion                                                    |
| Delete wedding          | Soft-delete root, revoke capabilities, suspend email work             | Asynchronous purge of related documents and R2 objects                                        |

Never hold a MongoDB transaction open while calling R2, Resend, or Google Places. A unique index plus a single atomic document update is preferable to a transaction when it fully protects the invariant. MongoDB Atlas deployment must support transactions for the cross-document cases.

### Email job claim algorithm

```typescript
const delivery = await EmailDelivery.findOneAndUpdate(
  {
    $or: [
      { state: { $in: ["pending", "retry"] }, nextAttemptAt: { $lte: now } },
      { state: "leased", leaseUntil: { $lte: now } }
    ]
  },
  {
    $set: { state: "leased", leaseUntil: leaseEnd },
    $inc: { attempts: 1 }
  },
  { sort: { nextAttemptAt: 1, _id: 1 }, new: true }
);
```

Claim individually until a small batch is filled. A recovery process must treat an expired lease as retryable, not lost. Attach a stable, persisted batch idempotency key to an identical set of message payloads across a retry. Do not arbitrarily regroup previously submitted ambiguous batches; keys must remain tied to the original payload. If a send outcome remains ambiguous beyond the provider's deduplication window, quarantine it for review.

## 10 Query patterns and aggregations

| Feature                 | Query shape                                                   | Output                                              |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Wedding event schedule  | events.find({weddingId}).sort({startsAt:1,_id:1})             | Only isPublished events on public route             |
| Organizer task list     | tasks.find({weddingId,status,assignedToUserId})               | Cursor-paginated task DTOs                          |
| Expenses spent          | Match weddingId; group signed amountMinor                     | Exact total without budget allocations              |
| RSVP attendance         | Match weddingId and eventId; aggregate status and extra count | Accepted, declined, pending and confirmed headcount |
| Wedding photo gallery   | photos.find({weddingId,state:"ready"}).sort({createdAt:-1})   | Metadata plus short-lived R2 GET links              |
| Guest invitation lookup | tokenHash indexed lookup, then verify event/wedding/status    | Only one invitation's RSVP data                     |
| Due reminder work       | state and nextAttemptAt index, leased atomically              | Small batch of jobs                                 |

Compute expense totals and RSVP summaries from indexed rows for V1. Avoid premature duplicated counters in the Wedding document that would need transactionally synchronized writes. If larger weddings show actual performance issues, add a derived read model with clear invalidation rules.

## 11 Retention and operational controls

| Data                | Policy direction                                                                    |
| ------------------- | ----------------------------------------------------------------------------------- |
| Sessions            | Revoke on logout/password reset; TTL on expiresAt                                   |
| Member invites      | Explicit expired, consumed or revoked state; retain minimum support history         |
| Password reset      | Short-lived and single use; invalidate old sessions on successful reset             |
| Guest tokens        | Revocation stops access immediately; disable on wedding deletion                    |
| Photos              | Private bucket; verified pending-to-ready state; orphan and deletion reconciliation |
| Email records       | Persist attempts/provider IDs for retry and support; prune after defined period     |
| Public wedding site | Expose explicit public DTOs, not raw Wedding or Guest documents                     |
| Wedding deletion    | Confirm with Admin; soft-delete first; purge dependent data asynchronously          |

Use structured application logs with requestId and error codes, without passwords, bearer links, email bodies or guest PII. Keep Atlas and R2 credentials in server-side Vercel environment configuration. Store no personal guest data in analytics scripts on invitation or gallery pages.

## 12 Verification plan

| Area               | Must test                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Tenant isolation   | Cross-wedding IDs, foreign event references, gallery access via wrong wedding              |
| Unique constraints | Concurrent signup, duplicate invitation per event, unique QR contact                       |
| Membership         | Join second wedding, expired organizer token, removal of last Admin                        |
| RSVP               | Missing/invalid status, negative/fractional/overflow additionalGuests, repeated submission |
| Money              | Integer paise, positive amounts, refunds, concurrent ledger edits                          |
| Guest privacy      | Token leak/forward/revoke, no public RSVP or email information                             |
| Photos             | Expired signed URL, missing R2 object, wrong MIME, aborted upload, orphan cleanup          |
| Email              | Duplicate Cron, lost lease, partial failure, rate limit, ambiguous provider acceptance     |
| Retention          | Soft-delete propagation, stale QR codes, backups and recovery                              |

All corner cases cannot be enumerated exhaustively. V1 release readiness requires the critical high-risk cases above to have explicit unit, API integration and end-to-end tests.

## 13 Product choices to finalize

| Open choice                            | Recommended default                              | Why it matters                                      |
| -------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Second Admin onboarding                | Creator is Admin; Admin may invite another Admin | Clarifies exceptional admin management privilege    |
| Same email for multiple guest contacts | Allow, but warn for potential duplicates         | Avoids assuming each family shares a unique mailbox |
| RSVP edit cutoff                       | Until function starts                            | Token lifetime and attendance revisions             |
| Gallery QR validity                    | Wedding date through agreed post-wedding window  | Retention and guest photo access                    |
| Upload constraints                     | JPEG/PNG/WebP plus explicit size/rate caps       | Cost and file safety                                |
| Gallery moderation                     | Guest uploads visible; organizer can remove      | Avoids approval workflow in V1                      |
| Refund handling                        | Positive expense and refund entries              | Net expense computation                             |
| Wedding deletion retention             | Soft-delete, then scheduled purge                | Privacy and recoverability                          |

## Official technical references

- https://mongoosejs.com/docs/guide.html

- https://mongoosejs.com/docs/transactions.html

- https://www.mongodb.com/docs/manual/core/index-unique/

- https://www.mongodb.com/docs/manual/core/index-partial/

- https://www.mongodb.com/docs/manual/core/indexes/index-types/geospatial/2dsphere/

- https://www.mongodb.com/docs/manual/core/index-ttl/

- https://developers.cloudflare.com/r2/api/s3/presigned-urls/

- https://resend.com/docs/api-reference/emails/send-batch-emails

- https://resend.com/changelog/batch-idempotency-keys

- https://vercel.com/docs/cron-jobs/usage-and-pricing
