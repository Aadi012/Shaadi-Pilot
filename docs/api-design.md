# Wedding Planning Platform API Design

> Converted from the [original Word document](source/api-design.docx). Wording and provisional decisions are preserved; approved implementation decisions are tracked in [architecture-decisions.md](architecture-decisions.md).

Version 1.0 · 24 October 2026 · Next.js TypeScript modular monolith

This document defines the V1 HTTP contract for the wedding planning application. It translates the approved system and MongoDB designs into implementable REST endpoints, request and response semantics, access boundaries, and failure handling. The wedding is the application tenant. The working product name may change without altering this API contract.

## 1 Contract decisions

| Topic               | V1 decision                                      | Impact                                                                     |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| API style           | Versioned JSON REST at /api/v1                   | Explicit contract even inside one Next.js project                          |
| Hosting and runtime | Next.js Route Handlers on Node.js runtime        | Mongoose, Resend, R2 SDK and Places server-side only                       |
| Organizer auth      | Opaque HttpOnly session cookie                   | Custom session management, no BetterAuth                                   |
| Organizer roles     | admin and manager                                | All planning APIs same; Admin alone manages membership                     |
| Tenant resolution   | Organizer session determines weddingId           | Do not accept client-selected tenant IDs                                   |
| Guest auth          | No login or guest accounts                       | Event invitation and gallery capabilities exchanged for short-lived access |
| Invitations         | One contact per event, RSVP per function         | Additional guest count is unlimited by product policy                      |
| Website             | Published homepage and schedule public           | RSVP and gallery require their respective capabilities                     |
| Media               | Direct PUT to private Cloudflare R2              | API issues signed upload intent, verifies completion                       |
| Email               | Resend plus MongoDB-backed work records          | Batch send and retry without Redis or separate worker                      |
| Currency            | INR expense ledger in integer paise              | Refund records, not budgets                                                |
| Geo                 | Latitude, longitude and optional Google Place ID | Server-side vendor discovery by proximity                                  |

### API boundary

- All browser calls to application data go through /api/v1. Server-side rendering may use the same application services directly, but must enforce identical authorization and validation.

- Endpoints are specified independently of the UI. API routes are thin adapters: parse and validate, authenticate, authorize, call a domain service, map result to a DTO, and handle errors.

- For V1, one User belongs to zero or one Wedding; a wedding can have multiple Users. There is no multi-wedding switcher.

- The API does not provide payment processing, guest account creation, budgeting, WhatsApp automation, SMS dispatch, native streaming infrastructure or guest-by-guest family-member records.

## 2 Global HTTP conventions

| Property        | Rule                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Base URL        | https://{host}/api/v1                                                                           |
| Content type    | application/json; charset=utf-8                                                                 |
| IDs             | Public JSON strings; internal MongoDB ObjectIds never accepted without validation               |
| Dates           | ISO 8601 UTC timestamps; local display uses wedding/event IANA timezone                         |
| Money           | Decimal string of minor units, e.g. "125000" for INR 1,250.00                                   |
| Pagination      | Opaque cursor, default limit 25, maximum 100, stable sort with _id tiebreaker                   |
| Filtering       | Only documented filter keys; reject unknown fields in mutations                                 |
| Patch           | PATCH is partial field update; omitted fields unchanged; null clears explicitly nullable fields |
| Idempotency     | Idempotency-Key required for listed POST side effects; client UUID recommended                  |
| Request tracing | X-Request-Id response header and meta.requestId; generated when missing                         |
| Caching         | Private endpoints Cache-Control: no-store; published public DTOs may use bounded caching        |
| CORS            | Same-origin web app; no wildcard cross-origin authorization                                     |

### Successful responses

```json
{
  "data": {
    "id": "670000000000000000000001",
    "title": "Sangeet"
  },
  "meta": {"requestId": "req_example"}
}
```

List responses use data as an array plus meta.pageInfo with nextCursor and hasMore. New resources return 201 Created and a Location header; successful DELETE and logout return 204 with no body. The response shape never exposes a Mongoose document or password, ciphertext, token hash, R2 object key or internal email provider credential.

### Error responses

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request failed validation",
    "details": [
      {"field": "additionalGuests", "reason": "Must be a nonnegative safe integer"}
    ]
  },
  "meta": {"requestId": "req_example"}
}
```

Error messages are stable, concise and safe for users. Do not return stack traces, whether another email address has an account, or the existence of foreign-wedding records. Domain error codes are documented in section 15.

## 3 Access model and security

| Principal                | How access is established                                             | Allowed scope                                                                   |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Anonymous visitor        | No credentials                                                        | Published wedding homepage and schedule only                                    |
| Organizer before joining | Valid organizer session, weddingId=null                               | Profile, create wedding, accept member invitation, password and session actions |
| Manager                  | Organizer session with weddingId                                      | All wedding planning features except member administration                      |
| Admin                    | Organizer session with weddingId                                      | Manager scope plus membership invitations, roles and removal                    |
| RSVP guest               | Short-lived access obtained with one event-specific invitation secret | Read and edit that invitation only                                              |
| Gallery guest            | Short-lived access obtained with one personal gallery secret          | List wedding-ready photos, obtain temporary read links, upload photos           |
| Internal cron            | Server-side CRON_SECRET                                               | Dispatch due email work, never exposed to browser                               |

All organizer-owned resource lookups use both _id and weddingId from the session. Foreign resources return 404, not 403. A valid session referencing an archived or deleting wedding is blocked from mutations. Every referenced event, vendor, assignee and guest contact must belong to the same wedding.

### Organizer cookie and CSRF

- Set a host-only cookie named __Host-mm_session with Secure, HttpOnly, Path=/ and SameSite=Lax. The browser receives a random opaque session value; only a hash is persisted in MongoDB sessions.

- Mutating organizer requests require a trusted Origin/Referer check and a CSRF token header bound to the session. Require fresh authentication for password changes or other sensitive account operations where appropriate.

- Rate-limit login, password reset, registration, invitation redemption and token-exchange endpoints by IP and a normalized account or capability key. Apply bounded backoff. Login and password-reset responses must not reveal account existence; registration returns the same generic 202 response for new and existing emails, without starting a session (security follow-up, 25 October 2026).

- Session lookup checks expiry, revocation and user status on every request. Log out revokes the session. Password reset invalidates all active sessions for that User.

- No mandatory email verification is introduced in V1. This is an intentional convenience/security trade-off; password resets and invitation links must be sent only to the configured address.

### Capability-link design

The invite URL is https://{host}/i/{publicId}#t={secret}; the gallery QR URL is https://{host}/gallery/{publicId}#t={secret}. The publicId is a non-secret lookup key; the high-entropy secret is placed in the URL fragment so it is not sent in the initial HTTP request path. The client exchanges publicId and secret via a POST JSON body and then removes the secret from the visible URL. This is the preferred V1 pattern, subject to real email-link rewriting compatibility tests.

The exchange returns a short-lived signed purpose-scoped guest access token held only in browser memory and sent in the Authorization: Bearer header. The token encodes no PII and remains valid only while the underlying invitation or gallery capability remains active; the API rechecks revocation and wedding status on each access. This introduces no guest identity account or guest session collection. RSVPs and gallery access cannot be interchanged.

The server stores a hash for secret lookup and an encrypted copy for authorized re-send or QR regeneration. The encryption key must be server-only and rotated with key IDs. PublicId should be indexed uniquely in the corresponding collection, an additive refinement to the database index plan.

## 4 Authentication and organizer onboarding

| Method | Path                          | Access                    | Purpose                                                           |
| ------ | ----------------------------- | ------------------------- | ----------------------------------------------------------------- |
| POST   | /auth/register                | Anonymous                 | Create organizer account, no email-verification step              |
| POST   | /auth/login                   | Anonymous                 | Start opaque session                                              |
| POST   | /auth/logout                  | Organizer                 | Revoke current session and clear cookie                           |
| GET    | /auth/session                 | Organizer                 | Current user, role, wedding membership                            |
| POST   | /auth/password-reset/requests | Anonymous                 | Send recovery email; always respond generically                   |
| POST   | /auth/password-reset/confirm  | Reset token               | Reset password, consume token, revoke sessions                    |
| GET    | /me                           | Organizer                 | Current profile                                                   |
| PATCH  | /me                           | Organizer                 | Update display name, not email without a separate recovery policy |
| POST   | /weddings                     | Organizer without wedding | Create wedding and become first Admin                             |
| POST   | /member-invites/accept        | Organizer without wedding | Consume invitation and join one wedding                           |

Register requires email, password and displayName. Normalize email before unique lookup, hash passwords using Argon2id and never return them. Return 202 with the same generic message for new and duplicate normalized email. Do not return a user DTO or set a session cookie. Users continue to login; duplicate attempts never replace existing credentials or profile fields. This supersedes the original 201/409 trade-off after the manual-test security review. Without email verification, subsequent login with a chosen signup password can still expose whether account creation succeeded; complete enumeration resistance is not claimed. Login uses a generic INVALID_CREDENTIALS response for incorrect credentials and nonexistent accounts.

Wedding creation accepts slug, displayNames, timezone, defaultLocation? and websiteTheme?. Creation and attaching the first Admin are one MongoDB transaction. A User already attached to a wedding gets 409 USER_ALREADY_IN_WEDDING. Slug collision returns 409 SLUG_TAKEN. Idempotency-Key is required so retries do not create two weddings.

Member-invite acceptance requires the organizer to be signed in and not already attached to a wedding. The invitation token is single-use, must not be expired or revoked, and its target emailNormalized must match the signed-in user's normalized email. Account email is not verified separately. A transaction consumes the token and assigns weddingId and role atomically.

### Representative onboarding request

```http
POST /api/v1/auth/register
{
  "email": "organizer@example.com",
  "displayName": "Aarav",
  "password": "long-private-password"
}

POST /api/v1/weddings
Idempotency-Key: 3df6b8d1-a910-4a87-94d8-17e3d0b2f851
{
  "slug": "aarav-ki-shaadi",
  "displayNames": {"partnerOne": "Aarav", "partnerTwo": "Ananya"},
  "timezone": "Asia/Kolkata",
  "websiteTheme": "classic"
}
```

## 5 Wedding settings and membership

| Method | Path                              | Access           | Request or result                                                                   |
| ------ | --------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| GET    | /weddings/current                 | Manager or Admin | Wedding and private settings DTO                                                    |
| PATCH  | /weddings/current                 | Manager or Admin | Couple names, public description, timezone, default location, theme, live stream ID |
| POST   | /weddings/current/publish         | Manager or Admin | Publish website homepage and eligible events                                        |
| POST   | /weddings/current/unpublish       | Manager or Admin | Remove public visibility                                                            |
| GET    | /members                          | Manager or Admin | Organizer list; no credential details                                               |
| GET    | /member-invites                   | Admin            | Pending/revoked/consumed invites                                                    |
| POST   | /member-invites                   | Admin            | Email, invitedRole, expiry; queue invite email                                      |
| POST   | /member-invites/{inviteId}/revoke | Admin            | Revoke unused invitation                                                            |
| PATCH  | /members/{userId}                 | Admin            | Permitted role change, depending on admin policy                                    |
| DELETE | /members/{userId}                 | Admin            | Remove member, revoke sessions, block last Admin removal                            |

Membership endpoints never allow Manager to administer other Managers. Admin invitation to another Admin is provisionally supported in this contract but must be confirmed before shipping; the API must always prevent a wedding ending without an Admin. Repeated member-invite creation should be deduplicated for the same pending target and should accept an Idempotency-Key to suppress duplicate emails. A User can belong to only one wedding. If a membership is removed, invalidate or reject their existing sessions immediately on the next request.

## 6 Wedding events and tasks

| Method | Path              | Access           | Purpose                                                  |
| ------ | ----------------- | ---------------- | -------------------------------------------------------- |
| GET    | /events           | Manager or Admin | List events, sort by startsAt then id                    |
| POST   | /events           | Manager or Admin | Create function                                          |
| GET    | /events/{eventId} | Manager or Admin | View full function details                               |
| PATCH  | /events/{eventId} | Manager or Admin | Edit title, timing, venue, publication                   |
| DELETE | /events/{eventId} | Manager or Admin | Archive or reject when linked records require resolution |
| GET    | /tasks            | Manager or Admin | Filter status, assignee, event, due date                 |
| POST   | /tasks            | Manager or Admin | Create and optionally assign task                        |
| GET    | /tasks/{taskId}   | Manager or Admin | Task detail                                              |
| PATCH  | /tasks/{taskId}   | Manager or Admin | Update whitelisted task fields                           |
| DELETE | /tasks/{taskId}   | Manager or Admin | Archive task                                             |

Event POST requires title, startsAt and endsAt, with optional timezone, venue, isPublished and sortOrder. Enforce endsAt later than startsAt and a valid IANA timezone. Venue accepts name, structured address, optional googlePlaceId and geo GeoJSON Point with coordinates [longitude, latitude]. A published event is public in the schedule but does not grant an RSVP capability.

Task POST requires title, with optional eventId, assignedToUserId, status, dueAt and description. Reject an assignee outside the wedding and an event ID outside the wedding. Status values: todo, inProgress and done. For concurrent edits, PATCH accepts If-Match carrying a version identifier; a stale version returns 412 PRECONDITION_FAILED. This optimistic concurrency pattern is recommended for tasks, event settings and contact edits.

## 7 Expenses and vendors

| Method | Path                  | Access           | Purpose                                               |
| ------ | --------------------- | ---------------- | ----------------------------------------------------- |
| GET    | /expenses             | Manager or Admin | Cursor-paginated ledger; filter event, category, date |
| POST   | /expenses             | Manager or Admin | Record paid expense or refund                         |
| GET    | /expenses/summary     | Manager or Admin | Net spent, gross expenses, refunds, by-event totals   |
| GET    | /expenses/{expenseId} | Manager or Admin | Ledger entry detail                                   |
| PATCH  | /expenses/{expenseId} | Manager or Admin | Edit notes/category/links, with provenance            |
| DELETE | /expenses/{expenseId} | Manager or Admin | Archive with reason; no silent total corruption       |
| GET    | /vendors              | Manager or Admin | Saved vendor directory                                |
| POST   | /vendors              | Manager or Admin | Add manual or Google Places vendor                    |
| GET    | /vendors/{vendorId}   | Manager or Admin | Saved vendor detail                                   |
| PATCH  | /vendors/{vendorId}   | Manager or Admin | Change status, contacts, event associations           |
| DELETE | /vendors/{vendorId}   | Manager or Admin | Remove saved vendor without deleting expenses         |
| GET    | /vendors/discover     | Manager or Admin | Proximate Places search through server proxy          |

Expense POST fields: title, entryType (expense or refund), amountMinor (positive decimal string), currency (INR), paidAt, optional eventId, vendorId, category and notes. The amount always remains positive; summary net = sum(expense) minus sum(refund). Do not implement budgets or allocations. A ledger item's amount/type correction should either be blocked after a chosen lock point or captured as an explicit reversal; ordinary edits to descriptive metadata are allowed.

Vendor discovery requires lat, lng and category; radiusMeters is bounded by server policy. Responses contain sanitized name, location, placeId, optional phone/website and map URL, without exposing the Google Places API key. Enforce quota, caching rules and per-user rate limits. Saved vendors remain separate from ephemeral Places results, and Google Place ID is deduplicated inside the wedding.

### Vendor discovery query

```http
GET /api/v1/vendors/discover?category=photographer&lat=26.9124&lng=75.7873&radiusMeters=12000

{
  "data": [
    {
      "placeId": "opaque-provider-place-id",
      "name": "Example Photo Studio",
      "geo": {"type": "Point", "coordinates": [75.79, 26.92]}
    }
  ],
  "meta": {"requestId": "req_example"}
}
```

## 8 Guest contacts and event invitations

| Method | Path                                    | Access           | Purpose                                            |
| ------ | --------------------------------------- | ---------------- | -------------------------------------------------- |
| GET    | /guest-contacts                         | Manager or Admin | Guest directory and event-filtered search          |
| POST   | /guest-contacts                         | Manager or Admin | Add family representative                          |
| GET    | /guest-contacts/{guestId}               | Manager or Admin | Contact detail and invitations                     |
| PATCH  | /guest-contacts/{guestId}               | Manager or Admin | Update name, email, phone, notes                   |
| DELETE | /guest-contacts/{guestId}               | Manager or Admin | Archive, preserving RSVP historical references     |
| GET    | /events/{eventId}/invitations           | Manager or Admin | Per-event recipient list and RSVP status           |
| POST   | /events/{eventId}/invitations           | Manager or Admin | Create invitations for selected contacts           |
| GET    | /events/{eventId}/rsvp-summary          | Manager or Admin | Pending, attending, declined, confirmed headcount  |
| GET    | /invitations/{invitationId}             | Manager or Admin | Invitation detail and dispatch state               |
| GET    | /invitations/{invitationId}/share-link  | Manager or Admin | Retrieve existing personal event link for WhatsApp |
| POST   | /invitations/{invitationId}/revoke      | Manager or Admin | Stop use of one RSVP capability                    |
| POST   | /invitations/{invitationId}/rotate-link | Manager or Admin | Rotate compromised secret; old URL no longer works |
| POST   | /events/{eventId}/invitations/dispatch  | Manager or Admin | Queue initial emails or reminders                  |

GuestContact represents one invited person and any accompanying family members, not separate people. Required contact fields: displayName. emailNormalized is needed for automated email but may be null for manually shared links. An optional phone number is organizer-facing only; no SMS or automated WhatsApp messaging in V1. Duplicate guest names and duplicate family emails can occur; warn rather than silently merging contacts.

Creating a per-event invitation requires guestContactIds, optional token expiration, and the parent eventId. The server creates one eventInvitation per unique (weddingId, eventId, guestContactId); it does not overwrite an already sent RSVP or reset a guest response. Repeated creation of the same pair returns existing metadata. Invalid/foreign contact IDs fail the entire request with a documented 4xx error, rather than partially inviting another tenant's contact.

Dispatch accepts kind (initial, rsvp_reminder or event_reminder), invitationIds? and dryRun?; a dry run returns eligibleCount and excludedCount without queuing. A normal dispatch uses a client idempotency key and creates durable emailDelivery records. Default targeting: initial for not-yet-invited recipients; rsvp_reminder for pending recipients; event_reminder for attending recipients. Organizers may choose subsets but cannot cause sends to revoked invitations or contacts without an email. The response is 202 with batchId and queuedCount, not a claim that recipients received messages.

### Create invitations

```http
POST /api/v1/events/670000000000000000000010/invitations
Idempotency-Key: 74afea45-6bd8-43c4-bfc2-294c451969b0
{
  "guestContactIds": [
    "670000000000000000000101",
    "670000000000000000000102"
  ]
}

201 Created
{
  "data": {
    "eventId": "670000000000000000000010",
    "createdCount": 2,
    "existingCount": 0,
    "invitationIds": [
      "670000000000000000000201",
      "670000000000000000000202"
    ]
  }
}
```

### Queue email reminders

```http
POST /api/v1/events/670000000000000000000010/invitations/dispatch
Idempotency-Key: 49d61738-c806-4f0c-9cda-d7642ce2b849
{
  "kind": "rsvp_reminder",
  "dryRun": false
}

202 Accepted
{
  "data": {
    "batchId": "670000000000000000000300",
    "queuedCount": 36,
    "excludedCount": 4,
    "state": "pending"
  }
}
```

## 9 Public website and live stream

| Method | Path                           | Access    | Purpose                                             |
| ------ | ------------------------------ | --------- | --------------------------------------------------- |
| GET    | /public/weddings/{slug}        | Anonymous | Published homepage details, theme and live video ID |
| GET    | /public/weddings/{slug}/events | Anonymous | Published schedule, venue and time                  |

The public DTO includes safe couple display names, public description, websiteTheme, a validated youtubeLiveId and published event information. It excludes all contact emails, guest names, RSVP statuses, personal QR links, unlisted events, tasks, expense totals and membership details.

An unpublished, archived or deleting wedding returns 404 through public routes. Published schedule entries may show a Google Maps link derived from a sanitized event venue. Server-side YouTube embed uses the validated video ID, never raw iframe markup. Public GETs can use bounded caching, but publication changes should invalidate affected paths.

## 10 Login-free guest RSVP API

| Method | Path                            | Access                                   | Purpose                                                 |
| ------ | ------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| POST   | /guest/invitations/exchange     | Anonymous with raw invitation capability | Obtain short-lived invitation-scoped access             |
| GET    | /guest/invitations/current      | RSVP Bearer token                        | Read guest greeting, function information, current RSVP |
| PUT    | /guest/invitations/current/rsvp | RSVP Bearer token                        | Replace RSVP status and additional guest count          |

The exchange body is publicId and secret, derived from the personal invitation URL. Exchange is rate-limited, checks the secret hash, expiry, revocation, wedding status and event existence, and returns a short-lived purpose=invitation access token. A failure always returns a generic INVALID_OR_EXPIRED_LINK or GONE response; it must not reveal contact details.

RSVP status is attending or declined when a guest submits a response; pending is the initial server state only. For attending, additionalGuests must be a nonnegative JSON safe integer with no product-defined maximum; the confirmed total for that family is 1 + additionalGuests. For declined, additionalGuests must be 0. Guests do not enter names for accompanying people and do not need couple approval.

By recommended V1 default, a guest may change the RSVP until that function starts; after cutoff, return 409 RSVP_CLOSED. This is a policy choice pending approval. Repeating an identical PUT is idempotent. Concurrent edits are last accepted write unless If-Match is supplied and checked. The access token cannot be used to read or edit any other invitation from the same wedding.

### RSVP update request

```http
PUT /api/v1/guest/invitations/current/rsvp
Authorization: Bearer {short_lived_invitation_access}
{
  "rsvpStatus": "attending",
  "additionalGuests": 5
}

200 OK
{
  "data": {
    "rsvpStatus": "attending",
    "additionalGuests": 5,
    "confirmedHeadcount": 6,
    "respondedAt": "2026-10-24T10:30:00.000Z"
  }
}
```

## 11 Organizer photo and gallery API

| Method | Path                                          | Access           | Purpose                                            |
| ------ | --------------------------------------------- | ---------------- | -------------------------------------------------- |
| GET    | /gallery/photos                               | Manager or Admin | Private photo metadata with temporary GET URLs     |
| POST   | /gallery/uploads                              | Manager or Admin | Allocate R2 upload intent                          |
| POST   | /gallery/uploads/{photoId}/complete           | Manager or Admin | Verify and finalize uploaded object                |
| DELETE | /gallery/photos/{photoId}                     | Manager or Admin | Mark for R2 deletion and remove from ready gallery |
| GET    | /guest-contacts/{guestId}/gallery-link        | Manager or Admin | Reissue the same guest-specific private link/QR    |
| POST   | /guest-contacts/{guestId}/gallery-link/rotate | Manager or Admin | Rotate and revoke prior QR access                  |
| POST   | /guest-contacts/{guestId}/gallery-link/revoke | Manager or Admin | Disable personal gallery capability                |

Gallery QR capability is per guest contact and wedding, not per event. It is independent of the event RSVP token. The first link request creates a galleryToken if none exists; later authorized retrieval decrypts the existing token so printed QR codes remain stable. Revocation is immediate for new checks, including short-lived exchanged guest access.

Upload intent body includes fileName, mimeType, sizeBytes and optional eventId. The API validates allowed image MIME/type, explicit size limit, per-actor quotas and event ownership; then reserves a pending Photo record and returns a short-lived presigned R2 PUT URL, required headers, photoId and expiration. Clients upload directly to R2; image bytes do not traverse Next.js API functions.

The complete endpoint performs an R2 HEAD and content validation, checks intended size/content type and marks the Photo ready only after verification. To avoid a signed URL overwriting a ready photo while the URL remains valid, prefer staging uploads under a temporary unique key and copying/committing to a separate immutable final key on completion. Cleanup removes expired pending records and orphaned staging objects. The R2 bucket stays private; GET URLs are short-lived.

### Photo upload intent

```http
POST /api/v1/gallery/uploads
{
  "fileName": "sangeet-01.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 2833921,
  "eventId": "670000000000000000000010"
}

201 Created
{
  "data": {
    "photoId": "670000000000000000000401",
    "uploadMethod": "PUT",
    "uploadUrl": "https://r2-account.r2.cloudflarestorage.com/...",
    "requiredHeaders": {"Content-Type": "image/jpeg"},
    "expiresAt": "2026-10-24T10:32:00.000Z"
  }
}
```

The uploadUrl is an R2 bearer credential. Return it only to the caller, never log it, do not persist it in client analytics, and avoid retrying after expiration without requesting a fresh intent.

## 12 Guest photo gallery API

| Method | Path                                      | Access                                     | Purpose                                             |
| ------ | ----------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| POST   | /guest/gallery/exchange                   | Anonymous with personal gallery capability | Obtain short-lived gallery-scoped access            |
| GET    | /guest/gallery/photos                     | Gallery Bearer token                       | List ready wedding photos and short-lived read URLs |
| POST   | /guest/gallery/uploads                    | Gallery Bearer token                       | Obtain constrained direct-upload intent             |
| POST   | /guest/gallery/uploads/{photoId}/complete | Gallery Bearer token                       | Verify a guest photo and publish as ready           |

The gallery exchange takes publicId and secret, validates the wedding-wide guest token, then issues a short-lived purpose=gallery bearer. The guest may view ready photos for that wedding and upload images with an attribution to the guestContact. Guest attribution stays organizer-visible; another guest cannot enumerate who uploaded a photo if this would reveal private contact identity. The API does not expose organizer expenses or event invitations.

Guest uploads use stricter IP/capability rate limits and daily photo-count limits to contain abuse. Provisional V1 defaults are JPEG, PNG and WebP, 20 MiB per image, and organizer ability to remove any photo after publication; there is no separate guest-upload approval queue. These thresholds and moderation behavior are pending product confirmation. Validate actual file signatures and supported decoding, not only caller-provided MIME metadata.

## 13 Email work and internal operations

| Method | Path                                | Access           | Purpose                                             |
| ------ | ----------------------------------- | ---------------- | --------------------------------------------------- |
| GET    | /email-batches/{batchId}            | Manager or Admin | Summary of queued, submitted, retry and failed work |
| GET    | /email-batches/{batchId}/deliveries | Manager or Admin | Per-recipient status without raw token secrets      |
| GET    | /api/internal/cron/emails           | CRON_SECRET only | Scheduler trigger to claim and send due deliveries  |

The internal Cron endpoint is intentionally outside the public /api/v1 namespace and is not exposed in the client SDK. Vercel Cron invokes the secured route; it must validate the authorization secret, disable caching, acquire bounded MongoDB leases and process a small batch within the function duration. Cron invocation can be duplicated or overlap, so leases, unique logical delivery IDs and persistent batch keys are mandatory.

The dispatch algorithm claims only due pending/retry jobs or expired leases, groups at most 25–50 deliveries, persists batch payload identity, calls Resend and records provider IDs/results. A delivery with an ambiguous acknowledgement must be retried only with the exact same Resend idempotency key and payload while inside the provider's documented 24-hour deduplication window. After that window, quarantine for reconciliation rather than blindly duplicating messages. Provider acceptance is submitted, not inbox delivery.

Time-critical email dispatch cannot depend on Vercel Hobby's daily-only Cron schedule. Run on Pro or document the accepted daily delay. Cron failures are logged with requestId, batchId, provider error category and retry count, without invitation secrets, reset links or full email bodies.

## 14 Dashboard, search and reusable data contracts

| Method | Path               | Access           | Purpose                                                      |
| ------ | ------------------ | ---------------- | ------------------------------------------------------------ |
| GET    | /dashboard/summary | Manager or Admin | Upcoming events, incomplete task count, spend, RSVP snapshot |

The organizer dashboard is a read-only aggregation over existing Wedding, Event, Task, Expense and EventInvitation documents. It does not create a separate dashboard collection in V1. Derived totals use weddingId filters and read-time aggregation; any cache is scoped to a wedding and invalidated by writes affecting totals.

### Domain DTO contracts

| DTO             | Required response fields                                                                     | Rules                                     |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| OrganizerUser   | id, email, displayName, weddingId?, role?                                                    | Never expose passwordHash or session hash |
| WeddingPrivate  | id, slug, displayNames, timezone, theme, published, status, defaultLocation?, youtubeLiveId? | Organizer-only settings                   |
| WeddingPublic   | slug, displayNames, theme, description?, youtubeLiveId?                                      | Published-safe projection                 |
| Event           | id, title, startsAt, endsAt, timezone, venue?, isPublished                                   | UTC timestamps with display timezone      |
| Task            | id, title, status, eventId?, assignedToUserId?, dueAt?, version                              | Status is todo, inProgress, done          |
| Expense         | id, title, entryType, amountMinor, currency, paidAt, eventId?, vendorId?                     | amountMinor is decimal string             |
| SavedVendor     | id, name, category, googlePlaceId?, contact?, location?, status                              | Not a verbatim Places API response        |
| GuestContact    | id, displayName, email?, phone?, notes?                                                      | Organizer DTO only, never public          |
| EventInvitation | id, eventId, guestContactId, rsvpStatus, additionalGuests, sentAt?, respondedAt?             | No secret fields                          |
| Photo           | id, eventId?, uploadedByType, state, createdAt, readUrl?                                     | readUrl short-lived, never objectKey      |
| EmailBatch      | id, state, queuedCount, submittedCount, failedCount, createdAt                               | Submitted means provider accepted         |

### Shared input schemas

- VenueInput: name?; address?: city, state, country, street?; geo?: GeoJSON Point with coordinates [longitude, latitude]; googlePlaceId?. Validate longitude from -180 to 180 and latitude from -90 to 90.

- User email: trimmed/lowercased for uniqueness and login. Accept standard address lengths; reject invalid syntax and control characters. It is not verified during account creation.

- String fields: explicit maximum lengths, Unicode-aware trimming and HTML output encoding; no untrusted HTML rendering in wedding descriptions or notes.

- Currency: expense currency is INR in V1; amountMinor is a decimal string representing a positive int64 value. Never parse through floating-point money arithmetic.

- Date ranges: from and to inclusive/exclusive boundaries documented per endpoint; store BSON UTC Date and render in an explicit event/wedding timezone.

- Query collection results: data array and meta.pageInfo nextCursor/hasMore. Cursor binds tenant, filters and stable sort; reject a cursor from another tenant or different filter set.

- For immutable IDs, deleting referenced records generally archives them and retains historical lineage. Hard deletion is reserved for the wedding erasure workflow.

### Collection pagination example

```http
GET /api/v1/tasks?status=todo&limit=25&cursor={opaqueCursor}

200 OK
{
  "data": [{"id": "670000000000000000000500", "title": "Finalize decorator", "status": "todo"}],
  "meta": {
    "requestId": "req_example",
    "pageInfo": {"nextCursor": null, "hasMore": false}
  }
}
```

## 15 HTTP status and stable error catalog

| HTTP | Code                            | Caller meaning                                                |
| ---- | ------------------------------- | ------------------------------------------------------------- |
| 400  | MALFORMED_JSON or INVALID_QUERY | Invalid structure, query syntax or unsupported field          |
| 401  | UNAUTHENTICATED                 | Missing or expired organizer session or guest bearer          |
| 401  | INVALID_CREDENTIALS             | Login failed with deliberately generic detail                 |
| 403  | FORBIDDEN                       | Role lacks privilege, including Manager trying Admin action   |
| 403  | CSRF_FAILED                     | Cross-origin or missing session-bound CSRF defense            |
| 404  | NOT_FOUND                       | Missing or cross-wedding object; also unpublished public site |
| 409  | USER_ALREADY_IN_WEDDING         | Account cannot join/create a second wedding                   |
| 409  | SLUG_TAKEN                      | Slug uniqueness collision                                     |
| 409  | DUPLICATE_INVITE or RSVP_CLOSED | Request conflicts with business state                         |
| 410  | INVALID_OR_EXPIRED_LINK         | Expired, revoked or consumed bearer capability                |
| 412  | PRECONDITION_FAILED             | If-Match or version check failed                              |
| 413  | FILE_TOO_LARGE                  | Upload violates approved size                                 |
| 415  | UNSUPPORTED_MEDIA_TYPE          | File type cannot be accepted                                  |
| 422  | VALIDATION_ERROR                | Structured valid JSON but invalid domain field                |
| 429  | RATE_LIMITED                    | Retry-After header indicates delay                            |
| 500  | INTERNAL_ERROR                  | Unexpected server failure; requestId for support              |
| 502  | PROVIDER_FAILURE                | Places, R2 or Resend failed after a live call                 |
| 503  | SERVICE_UNAVAILABLE             | Temporary persistence or dependency unavailability            |

For public capability exchange, do not distinguish a nonexistent publicId from a wrong secret or revoked capability in a way that helps enumerate guests. A response may use 410 with the same safe message for all unusable capabilities. Return Retry-After on 429 and transient 503 when a retry window is known. Do not return 200 on invalid operations simply to avoid handling errors.

### Global exception mapping

1. Schema validation throws a typed 400/422 response with field-level details.

2. Authentication middleware resolves organizer sessions or purpose-scoped guest bearer. Absent/invalid credentials become 401 (or generic 410 at capability exchange).

3. Authorization service injects weddingId into all database queries and validates every referenced record. Foreign resources map to 404.

4. Mongo duplicate-key exceptions are mapped to stable business 409 codes, except registration, which returns its generic 202 outcome. Raw exceptions are never leaked.

5. Upstream errors are classified as retryable/nonretryable. They are logged with requestId, not dumped to callers.

6. Unhandled errors become 500 with server-only logs and no stack trace, secrets or raw Mongo driver details in JSON.

## 16 State transitions and idempotency

| Resource       | Allowed transitions                                                    | Non-negotiable constraint                                |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Invitation     | pending -> attending or declined; attending <-> declined before cutoff | Guest edit applies only to own event invitation          |
| Member invite  | pending -> consumed, revoked or expired                                | Single use, matching account email, never second wedding |
| Gallery access | active -> revoked or expired; rotated to new capability                | Old capability and derived access rejected               |
| Photo          | pending -> ready, rejected or deletion; ready -> deleting -> deleted   | Only ready photos visible to guests                      |
| Email delivery | pending -> leased -> submitted or retry or failed                      | Lease recovery and provider idempotency                  |
| Wedding        | active -> archived or deleting                                         | Archived/deleting invalidates public and guest access    |
| Task           | todo <-> inProgress <-> done                                           | Version checks prevent silent overwrites when requested  |

Require Idempotency-Key on POST /weddings, POST /events/{id}/invitations, invitation email dispatch, and any operation that creates externally visible or costly side effects. On first execution store a hash of authenticated principal, route and normalized request body with its key, resulting resource ID and stable outcome. Retry with the same key and identical input returns the prior outcome; reuse with a different payload returns 409 IDEMPOTENCY_CONFLICT. Retain the application key long enough to cover reasonable client retries and provider replays. It must be scoped to the wedding and caller to avoid cross-tenant key collisions.

PATCH writes requiring concurrency control use ETag/If-Match with a version field. A client may fetch the newest entity and retry after 412; do not blindly re-submit stale writes. Use MongoDB compound unique indexes for invitation uniqueness and logical email job keys. Use transactions only where multiple records must change atomically; do not hold database transactions across Resend, R2 or Google Places calls.

### RSVP transactional detail

The RSVP is a single conditional EventInvitation update. The API checks the invitation's wedding, event timing, revocation, token scope and an optional expected version in the same service operation. It then writes rsvpStatus, additionalGuests and respondedAt. Reporting aggregations calculate 1 plus additionalGuests only when attending; pending and declined contribute zero. A changed response does not create a second invitation or second family record.

## 17 Critical request sequences

### Organizer registration and wedding creation

1. Anonymous client POSTs /auth/register. Server validates email/password and creates User without wedding membership if the email is new. New and existing emails receive the same generic 202 response with no session. The client continues to login to establish a session.

2. Signed-in user POSTs /weddings with a stable Idempotency-Key. A transaction creates Wedding and joins the User as Admin.

3. The client loads /auth/session and /dashboard/summary. All later organizer CRUD operations use session.weddingId.

4. For a family member, Admin POSTs /member-invites. Server stores single-use token and queues Resend email. Recipient signs in or registers, then POSTs /member-invites/accept.

### Event invitation and RSVP

1. Organizer creates an Event and GuestContact, then POSTs /events/{eventId}/invitations with the guestContactId.

2. Server creates one per-event invitation capability with publicId, hash and encrypted copy.

3. Organizer dispatches an initial invitation email; a Resend worker submits the queued email. Organizer may also use share-link for WhatsApp manual sharing.

4. Guest opens the invitation page and POSTs /guest/invitations/exchange with the capability from the URL.

5. Guest GETs their event invitation then PUTs RSVP with any nonnegative additional-guest count. Dashboard and per-event counts update through aggregation.

6. An RSVP reminder may be queued only while the invitation is eligible; it links to the same unrevoked invitation capability.

### Guest gallery QR and direct photo upload

1. Organizer obtains personal gallery-link for a guest contact and shares or prints the QR.

2. Guest opens the private gallery URL, exchanges its distinct capability and receives a short-lived gallery bearer.

3. Guest requests /guest/gallery/uploads and receives a signed temporary PUT to R2.

4. Browser PUTs image bytes straight to R2 and calls /guest/gallery/uploads/{photoId}/complete.

5. Server validates R2 object, commits stable photo storage and marks Photo ready. Authorized guests can now list and view it with temporary GET URLs.

6. Organizer may delete or hide content; the gallery list then excludes the Photo, while deletion cleanup retries R2 failures.

## 18 Failure modes and acceptance tests

| Situation                                                             | Expected API behavior                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Organizer signs up using an existing normalized email                 | Generic 202 without a session; never duplicate or overwrite User |
| Member invite link forwarded to other signed-in email                 | 403 or 410, cannot join using mismatched account                 |
| Unverified email account receives password reset                      | Generic request response; real inbox owner can reset             |
| User already belongs to another wedding                               | 409, no membership change                                        |
| Admin attempts to remove last remaining Admin                         | 409, preserve minimum one Admin                                  |
| Manager calls a member-management mutation                            | 403, no state change                                             |
| Cross-wedding event ID appears in Task, Expense or Invitation request | 404, no foreign data disclosure                                  |
| Duplicate event invitation creation races                             | Unique index guarantees one pair; idempotent response            |
| Guest tries to RSVP for different event using original bearer         | 403/404, strict event scope                                      |
| Guest submits negative, fractional, NaN or unsafe additionalGuests    | 422, existing RSVP unchanged                                     |
| Guest repeatedly submits same RSVP                                    | Same state and headcount, no duplicate invitation                |
| Guest RSVP after configured cutoff                                    | 409 RSVP_CLOSED                                                  |
| Public visitor requests private gallery or RSVP record                | 401/404, never expose user or guest data                         |
| Guest shares gallery URL                                              | Receiver has bearer access; organizer can rotate/revoke          |
| R2 upload intent expires or file is aborted                           | 410/422; pending record eventually reconciled                    |
| Uploaded bytes do not match size/type                                 | 422, mark rejected and clean staging object                      |
| Gallery access revoked during an upload                               | Completion rechecks capability and rejects                       |
| Double-click on email dispatch                                        | Application idempotency returns one logical batch                |
| Cron overlaps or retries after timeout                                | Atomic leasing and provider batch key avoid routine duplicates   |
| Resend outcome unknown beyond 24 hours                                | Quarantine for review, do not automatically resend               |
| Google Places quota or provider failure                               | 429/502 with retry guidance; saved vendor list unaffected        |
| Public wedding is unpublished or deleted                              | 404; old guest links blocked immediately                         |
| Concurrent update with stale If-Match                                 | 412, return no partial mutation                                  |
| Organizer tries URL injection or arbitrary R2 key                     | 400/403; no signed access to arbitrary object                    |

### Verification strategy

- Contract tests validate every public response and error against shared TypeScript/Zod schemas or an OpenAPI 3.1 schema generated from them.

- API integration tests run against an isolated MongoDB replica set and exercise compound indexes, transactions and tenant injection.

- Provider adapters for Resend, Places and R2 are mocked in unit tests; bounded integration smoke tests validate sandbox/test credentials.

- End-to-end tests cover organizer setup, member invite acceptance, creation of several functions, different per-function RSVPs, gallery QR sharing, photo uploading, publishing and unpublishing.

- Security tests cover cookie flags, CSRF, token purpose mismatch, token revocation, replay, referrer leakage, secret redaction, IDOR and query injection.

- Load tests should model wedding peaks: several family organizers editing, hundreds of RSVP writes, concurrent gallery uploads, and clustered reminder batches.

## 19 Implementation organization

Suggested Next.js App Router file layout:

```text
src/
  app/
    api/
      v1/
        auth/...
        weddings/...
        events/...
        tasks/...
        expenses/...
        vendors/...
        guest-contacts/...
        invitations/...
        guest/...
        gallery/...
      internal/
        cron/emails/route.ts
  modules/
    auth/
    weddings/
    events/
    tasks/
    expenses/
    vendors/
    guests/
    gallery/
    email/
  lib/
    db/
    api/
    security/
    providers/
```

Each module owns validation schemas, typed DTOs, domain service, repository/query layer and Route Handler adapters. Route files should be minimal and use a standard wrapper for requestId, auth, CSRF, input parsing and exception mapping. Use one lazy MongoDB connection utility per Node process; make sure Route Handlers that use Mongoose declare Node.js runtime. Third-party secrets stay on the server.

Keep a generated OpenAPI 3.1 contract as the next implementation artifact. This document is the product-level contract; the OpenAPI spec will provide machine-readable field requiredness, enums, examples and client SDK generation. Resolve documented open decisions before freezing the OpenAPI schemas.

## 20 Product decisions not yet formally approved

| Pending decision                 | Recommended V1 default                                  | Consequence                                             |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Second Admin                     | Creator may invite second Admin                         | Allows recovery and succession, but requires safeguards |
| RSVP cutoff                      | Until event begins                                      | Affects 409 RSVP_CLOSED and event edits                 |
| Guest contact duplicate email    | Allow with warning                                      | Shared family mailboxes remain possible                 |
| Gallery link lifetime            | Wedding date through a defined post-event window        | Controls token expiry and photo retention               |
| Guest photo format and size      | JPEG, PNG, WebP, 20 MiB                                 | Enforced at upload intent and completion                |
| Guest upload moderation          | Publish after validation; organizer can remove          | No manual approval queue                                |
| Expense amount correction        | Reversal/refund for financial changes                   | Prevents silently changing historical totals            |
| Wedding and photo retention      | Soft-delete then scheduled purge                        | Defines deletion API and cleanup deadlines              |
| Email URL fragment compatibility | Use lookup ID plus fragment secret; test email rewrites | Avoids logging bearer secrets in request path           |

These recommended defaults are not additional product approvals. They are explicitly provisional and should be signed off before API implementation tests become release gates.

## Official technical references

- https://nextjs.org/docs/app/getting-started/route-handlers

- https://mongoosejs.com/docs/transactions.html

- https://www.mongodb.com/docs/manual/core/index-unique/

- https://developers.cloudflare.com/r2/api/s3/presigned-urls/

- https://developers.cloudflare.com/r2/objects/upload-objects/

- https://resend.com/changelog/batch-idempotency-keys

- https://vercel.com/docs/cron-jobs/manage-cron-jobs

- https://vercel.com/docs/cron-jobs/usage-and-pricing
