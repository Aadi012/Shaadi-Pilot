# Architecture decisions

Scaffold baseline accepted on 24 October 2026. Source documents remain inputs;
approval to create the scaffold does not resolve the product choices below.

## Accepted foundation

- ShaadiPilot is one TypeScript Next.js App Router application using Node.js.
- Explicit REST APIs live under `/api/v1`; browser business writes use them.
  Authorized server-rendered reads may call services directly.
- MongoDB Atlas with Mongoose is the persistence layer. The wedding is the tenant.
- A User has no wedding during onboarding, then belongs to at most one wedding.
- Admin and Manager share planning permissions; Admin alone administers membership.
- Authentication uses custom database-backed opaque sessions. Guests have scoped
  links and no accounts. V1 does not require email verification.
- Media uses private R2 storage; email uses Resend and durable MongoDB batches;
  vendor discovery uses Google Places; deployment targets Vercel.
- Start with npm, Node.js 24, strict TypeScript, ESLint, Prettier and Vitest.
- Add feature modules, provider SDKs, integration tests and browser tests as their
  behavior is implemented. Do not add a monorepo, backend server, other ORM,
  authentication framework or queue infrastructure.

## Wedding creation slice — 25 October 2026

The user approved the supplied wedding onboarding/overview design prompts and
finalized Stitch screens, then authorized implementation. This accepts the PRD's
explicit wedding date alongside timezone and resolves the earlier missing-date
contract for creation: `weddingDate` is a validated `YYYY-MM-DD` calendar string,
never an inferred UTC timestamp. Required fields are the two partner names,
wedding date, manually entered location, IANA timezone and unique slug; the intro
is optional (200 characters). The API accepts `location` as a string and persists
it as `defaultLocation.name`; richer venue details and theme selection are later.
The date may be past or future; no invented product cutoff is imposed.

Creation and first-Admin assignment are one transaction. The client supplies a
UUID `Idempotency-Key`, scoped to its authenticated user; a durable hashed receipt
replays matching requests and rejects changed payloads. Receipts have no automatic
expiry and must follow account/wedding deletion policy before release. A fresh
conditional write against null membership enforces one wedding even under races.
No client wedding ID or role is accepted. The creator is Admin; this does not
resolve second-Admin, transfer or last-Admin membership policies.

`POST /api/v1/weddings`, `GET /api/v1/weddings/current` and authenticated
`GET /api/v1/weddings/slug-availability?slug=...` are the creation/read contracts.
Availability reveals only reservation status, never owner or wedding details.
Writes require trusted Origin and session-bound CSRF. MongoDB limits apply per
user: 20 creation attempts and 60 availability checks per 15-minute window.
Apply `npm run db:wedding:indexes` before enabling this slice in each environment.

The initial private overview derives tenant identity from current User membership,
never a query parameter. Cross-module dashboard reads only count documents scoped
to that wedding. Planning CRUD, populated summaries, member invites, publishing
and recovery are outside this slice. Existing nonempty expense records produce an
unavailable-total indicator until the expense module defines exact aggregation;
only an empty ledger displays ₹0. Disabled future controls are labelled honestly.
User-approved layouts override generated claims about encryption, billing,
concierge, offline cache and public join codes. The brand and reduced-motion
behavior take precedence over generic Stitch skill styling defaults.

## Wedding details editing — 26 October 2026

The user approved the Settings → Wedding details desktop/mobile designs and
authorized implementation, delegating the two proposed defaults to engineering.
The wedding slug remains locked in this slice. Changing the main calendar date or
planning timezone never reschedules existing events or changes their timestamps
or explicitly stored timezones; the wedding timezone is the default for future
events. This follows the event-owned timezone model in the database document.

Admins and Managers may edit couple names, the main date, manual location,
planning timezone and the optional 200-character introduction. Publication,
themes, livestream and membership are excluded. The broader source PATCH row is
delivered incrementally, not as authorization for all settings at once.

`PATCH /api/v1/weddings/current` requires a strong quoted numeric `If-Match`
version. GET and PATCH expose a private DTO `version` and matching ETag; MongoDB
`__v` is compared and incremented atomically. Missing preconditions return 428,
malformed versions 400 and stale writes 412. Existing records without `__v` are
treated as version zero. A conflict preserves the local draft and requires
explicit discard before loading the reviewed latest details. No forced overwrite
or implicit retry with a newer version is allowed. Tenant identity and role are
re-read server-side; caller-supplied identifiers never choose the wedding.

Drafts stay in memory only. Failed saves retain them, and leaving a dirty page
asks for confirmation. They are not persisted across closing/reloading the page.
Public website refresh behavior will be implemented with that later feature.

Account-switch follow-up (27 October): the settings client compares the refreshed
session's weddingId with the saved draft's wedding ID before using its new CSRF
token. A mismatch or missing wedding blocks PATCH and preserves the draft. The
latest-details review also rejects another wedding's response. Numeric record
versions alone do not identify a tenant. These are client workflow safeguards;
server authorization continues to derive wedding context from the current session.

## Password recovery slice — 26 October 2026

The user approved the recovery design prompt, supplied finalized Stitch project
14249455352497050706 and authorized implementation. Four recovery references were
retrieved and inspected. Existing branding wins over generated replacements;
passkey copy, state inspectors, encryption claims and placeholder legal links are
excluded. No separate transactional-email screen was found; the simple email
template follows the approved brief. The user chose mocked delivery verification;
no actual email send or sender-domain configuration is authorized by that choice.

- Canonical request and confirm APIs are the API document's
  `/api/v1/auth/password-reset/requests` and `/confirm`. The older system-design
  forgot/reset API names are not aliases. A narrow POST `/validate` inspects token
  validity before showing password fields; it returns only a boolean and never
  consumes the token or exposes account data.
- Links contain 256-bit secrets in a URL fragment, not paths or queries. The
  browser removes the fragment after reading it and retains the token only in
  memory; refresh requires reopening the email link. Opening another token in
  an existing reset tab reloads the document and clears the previous draft.
  Recovery pages use no-referrer, no-store and noindex protections.
- Links expire after 30 minutes. MongoDB stores SHA-256 hashes for validation and
  checks expiry independently of TTL. Reset confirmation changes the Argon2id hash,
  advances a credential version, consumes all prior reset tokens and revokes all
  prior sessions atomically. It never signs the user in or changes membership.
  A shared User write serializes competing requests, resets and login rotation.
- Re-requesting does not invalidate an earlier unexpired link: an attacker must
  not invalidate a mailbox owner's link merely by requesting another one. One
  successful reset invalidates all older links. Disabled accounts cannot recover.
- Requests use the same generic 202 for unknown, disabled and active accounts;
  configuration failures fail consistently with 503 before account lookup.
  Exact timing equivalence is not claimed. Origin and anonymous/session CSRF are
  required on every recovery POST. Mongo fixed 15-minute limits: requests
  20/network and 3/normalized account; validation 60/network and 20/token hash;
  confirmation 20/network and 5/token hash. Limits need pilot review before launch.
- Email delivery uses platform-scoped MongoDB delivery and batch records. In this
  low-volume slice each immutable provider batch holds one reset email. A process
  handles at most five due deliveries; no regrouping occurs on retry. A 60-second
  owner-bound lease, five-attempt limit and 30-second exponential backoff bound
  work. Provider calls use an eight-second timeout outside transactions. Stable
  payloads and Resend idempotency keys survive lost acknowledgements. Attempts
  outside a conservative 23-hour provider window are quarantined; reset expiry
  normally cancels work much sooner. Submitted means provider accepted, not inbox
  delivered. Provider webhooks and reminder dispatch are outside this slice.
- AES-256-GCM encrypts the complete immutable email payload, including recipient
  and link, with batch identity and key ID as authenticated data. This is separate
  from the validation hash. Ciphertext is erased after terminal processing; the
  batch's TTL expires at the token deadline. Delivery audit metadata expires seven
  days later. Only the current key ID is supported: drain/expire queued jobs before
  changing the key, or jobs fail closed. This is not a general gallery keyring.
- Next.js `after` makes a best-effort immediate dispatch after durable acceptance.
  `/api/internal/cron/emails` uses `CRON_SECRET` for retry/drain. No production
  schedule is created here. Timely scheduled invocation is required before launch;
  a daily schedule cannot serve a 30-minute recovery link.
- Reset pages live outside the login/signup redirect layout so an existing session
  cannot prevent mailbox-based recovery. New passwords follow the existing
  15-code-point / 128-UTF-16-unit policy. Tests use isolated Atlas databases and a
  mocked Resend adapter; production never substitutes a mock transport.

## Manager invitation slice — 27 October 2026

The user supplied finalized Stitch screens and authorized implementation. This
slice fixes invited roles to Manager with a seven-day expiry. Existing-member
removal, second Admin, role changes and ownership transfer are not implemented.
Admin-only writes derive the wedding from fresh server membership; expected
wedding/account headers detect stale tabs and never select authorization scope.

Invites store random-secret hashes; creation plus encrypted email work and durable
request receipts are transactional. Acceptance requires the exact authenticated
normalized email and atomically consumes the invitation while attaching an active,
unjoined User. Shared `Wedding.membershipVersion` writes serialize membership
operations; future membership/lifecycle operations must use that convention.

Fragment secrets are removed immediately and staged in a 15-minute HttpOnly,
host-only cookie (Secure `__Host-` cookie in production). This holds invitation
intent, not authentication. Login returns only `/join` or `/account`. No invitation
ever bypasses password authentication or auto-accepts. Reopen the email link after
the temporary context expires. Matching accepted retries are safe within validity.

The delivery worker now supports wedding-scoped member invites alongside platform
password resets. The protected drain processes at most two resets and three
invites; no scheduler was configured. Keep encryption keys through the seven-day
invite window. Eligibility is checked before provider submission, but an email
already in flight cannot be recalled; current link state still blocks revocation.

The user subsequently configured Resend and explicitly authorized one real test.
Provider submission succeeded; the user confirmed inbox receipt, acceptance and
overview navigation. Read-only MongoDB verification confirmed accepted state and
Manager membership in the test wedding. This is local test evidence, not verified
production delivery or a live password-recovery test. Preserve the test wedding
and its new real membership until the user chooses cleanup. See the
[implementation contract](organizer-invitations.md) and [roadmap](roadmap.md).

## Manager removal slice — 27 October 2026

The user authorized Admin removal of Managers as the next feature. The canonical
route is DELETE `/api/v1/members/{userId}`. Only a fresh Admin in the same active
wedding may remove a Manager; self/Admin removal, role changes and ownership
transfer stay excluded. The expected wedding header is a stale-tab guard only.

Removal detaches User weddingId/role, revokes all existing sessions and revokes
pending/accepted invitations for that email in this wedding, in one transaction
using the shared wedding membership lock. Preserve account credentials and
planning records. Removed users may log in as unjoined users; a new invitation
and explicit acceptance are required to rejoin this wedding. Invitations to
other weddings remain untouched. Already in-flight requests are not recalled;
subsequent requests must recheck fresh session/membership.

User.membershipVersion starts at zero (including legacy missing fields), advances
on joining/removal, and is returned on each roster DTO. DELETE requires a strong
quoted numeric If-Match for that member. Missing = 428, malformed = 400, stale =
412; foreign/already-removed IDs = 404. This prevents an old tab or lost-response
retry from removing a later membership generation. No force/retry with a fresh
version without reloading and reviewing. No extra receipt collection is needed:
repeated deletion safely fails after removal and cannot affect a new membership.

Existing assignments are retained; the Tasks slice must define presentation and
reassignment for former organizers without exposing another wedding's data.

## Remaining open product and contract decisions

| Topic                  | Conflict or missing decision                                                                                                     | Proposal awaiting confirmation                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Admin policy           | PRD leaves Admin onboarding and transfer open; later contracts provisionally support it                                          | Admin may manage other Admins, with last-Admin protection                        |
| Guest entry            | PRD shows multiple invited functions from one link; technical contracts issue per-event capabilities and a separate gallery link | Confirm the entry experience before implementing capability contracts            |
| Guest email            | PRD requires email; API permits manually shared contacts without email                                                           | Confirm requiredness; duplicate family emails also need a policy                 |
| Public website images  | PRD permits image customization; only private gallery media is modeled                                                           | Define separately published website assets and authorization                     |
| Expense corrections    | PRD permits edits/deletions; later contracts introduce refunds/reversals                                                         | Confirm editable entries versus reversal semantics                               |
| Currency               | PRD includes currency; database/API choose INR-only                                                                              | Confirm INR-only scope                                                           |
| Routes and DTOs        | Signup/register, nested/flat tenant paths, me/current and error envelopes differ                                                 | Prefer the API document's flat tenant-relative routes and one canonical envelope |
| Guest access transport | Architecture suggests a cookie; API specifies memory-only signed bearer tokens                                                   | Choose transport and page-reload/re-entry behavior                               |
| RSVP cutoff            | Later documents suggest event start, but mark it provisional                                                                     | Allow edits until that function starts                                           |
| Reminders              | PRD proposes manual RSVP reminders; technical contracts also include scheduled/event reminders                                   | Start with organizer-triggered RSVP reminders                                    |
| Publication            | API scenario couples unpublishing to guest denial; other sections tie denial to lifecycle status                                 | Keep public visibility independent of private guest access                       |
| Gallery constraints    | Formats, size, quotas and moderation are provisional                                                                             | Consider JPEG/PNG/WebP, 20 MiB and publication after validation                  |
| Lifecycle              | Guest-link expiry, photo retention, deletion grace and purge timing are unset                                                    | Define explicit retention and revocation policies before launch                  |
| Hosting and scale      | Pilot scale, email delay, quotas and recovery targets are unset                                                                  | Confirm commercial Vercel plan, batch cadence and operating limits               |
| Email link fragments   | API's fragment-secret pattern needs real email-client compatibility checks                                                       | Verify before freezing guest URL contracts                                       |

## Engineering requirements for later phases

- Complete persistence contracts for capability public IDs, idle/absolute session
  lifetimes, archive/version fields, CSRF state and durable API idempotency.
- Validate all foreign references within the authenticated wedding. Exclude private
  content from public projections, analytics and shared caches.
- Serialize membership changes through a shared wedding write in a transaction;
  counting Admins alone is insufficient under concurrent removals.
- Recover unverified-email accounts safely without letting membership tokens bypass
  password authentication. Revoke prior sessions after password recovery.
- Use exact money and headcount arithmetic, including `1 + additionalGuests` and
  aggregate overflow. Do not introduce a product cap on accompanying guests.
- Separate logical email dispatches from immutable provider-sized batches. Persist
  payload identity, lease ownership and ambiguous/quarantined outcomes. Recheck
  eligibility before sending; never hold database transactions across provider calls.
- Do not promise indefinite exactly-once email delivery. Resend's deduplication
  window is finite; ambiguous sends beyond it need reconciliation.
- Decode and validate uploaded bytes, bound dimensions and reserve quotas. HEAD
  metadata alone is insufficient. Recheck ownership at completion and commit to
  immutable final keys to prevent later overwrite using a still-valid PUT URL.
- Guest capability revocation blocks new authorization checks; already issued R2
  URLs remain usable until their short expiry. Document this bounded exposure.
- Create gallery capabilities using POST; a read-only GET must not create state.
- Separate organizer-entered vendor data from provider content, and follow Places
  storage and attribution rules. Saving a result does not waive those restrictions.
- Keep structured operational logs and define how internal errors can be diagnosed
  safely; never add raw error objects, request URLs or provider bodies to logs.
- Use replica-set integration tests for transactions, indexes and concurrency.
- Apply versioned indexes explicitly in production, where autoIndex is disabled.
- Define cleanup invocation, backup/restore procedures and deletion propagation
  before a production release.

## Temporary tooling exception

- Recorded: 24 October 2026. Review by: 24 November 2026, or sooner when the
  Next.js lint plugin set changes. Owner: repository maintainers.
- ESLint 9.39.5 is end-of-life. It is retained temporarily because the installed
  React lint plugin declares peer compatibility through ESLint 9. TypeScript
  6.0.3 is retained because the installed lint parser supports versions below 6.1.
- Scope: development and CI tooling only. The application does not use ESLint at
  runtime. The 24 October dependency audit reported no known vulnerabilities;
  that result does not replace resolving unsupported-tooling maintenance debt.
- Upgrade ESLint and its plugin set together when a compatible supported set is
  available. Keep the existing TypeScript peer range until parser support changes.
  Validate the dependency tree, linting, types, tests and build after any upgrade.
- Do not use forced peer resolution, disabled checks or an additional lint
  framework as a workaround. This exception is not permission for incompatible
  upgrades or an indefinite deferral.
- CI installs npm 11.19.1, matching `package.json`, before `npm ci`.

## Organizer authentication slice — 25 October 2026

The user authorized MongoDB-backed registration, login, logout and sessions after
the UI preview. This slice adopts the previously proposed seven-day idle and
30-day absolute session policy and the API document's `register`, `login`,
`logout` and `session` endpoints under `/api/v1/auth`.

- Production cookie: `__Host-shaadipilot_session`, Secure, HttpOnly, host-only,
  Path=/, SameSite=Lax; local HTTP: `shaadipilot_session`. This intentionally
  replaces the API source's historical `__Host-mm_session` name.
- Session storage adds `absoluteExpiresAt`; `expiresAt` is the rolling idle limit
  capped at the absolute limit. TTL is cleanup, never the authorization check.
- GET session also supports anonymous CSRF bootstrap (`user: null`), an explicit
  extension to the API source's organizer-only access row. Tokens are HMAC-derived
  from an HttpOnly random anonymous secret before login and from the session
  secret afterward. Mutations require a matching header and exact trusted Origin.
- Argon2id uses 19 MiB, two iterations and one lane. New passwords require at
  least 15 Unicode code points and at most 128 UTF-16 code units, preserving
  whitespace. This supersedes the earlier eight-character UI preview guideline.
- MongoDB fixed 15-minute windows: login 10/account, 50/network; registration
  5/account, 20/network. Network identity trusts only Vercel's overwritten header;
  other environments share a conservative network bucket. No raw identifiers
  appear in bucket keys. Revisit limits against pilot traffic before launch.
- Unique email and session-token indexes are mandatory. A versioned additive
  setup script creates them; runtime fails closed if required indexes are absent.
  User/session creation and reauthentication rotation are MongoDB transactions.
- Registration does not verify email, assign a role or create a wedding.
  `/account` is a minimal protected account confirmation, not a dashboard.
- Random opaque sessions need no `SESSION_SECRET`; future token-signing or
  encryption will use separately defined keys. This clarifies the source's
  provisional general-purpose secret variable.

Recovery remains a separate feature and a prerequisite for public onboarding.
Breached-password screening and hosting abuse controls also remain release work.
No other open product decisions are resolved by this slice.

### Manual-test follow-up — 25 October 2026

The user requested removal of registered-email disclosure and redirects away from
login/signup for authenticated users. This supersedes the original API document's
201-with-session / 409-duplicate registration trade-off: both accepted signup
attempts now return 202 with the same generic message and no session or user DTO.
Users continue to login. Existing account details are never overwritten, and a
duplicate request never authenticates the caller. Both paths perform password
hashing; no claim of identical timing or complete enumeration prevention is made.
Without email verification, subsequent login with an attacker-chosen signup
password can still reveal whether account creation succeeded. V1's no-verification
policy remains unchanged; recovery is still a public-launch prerequisite.

A dynamic server layout checks the stored session before rendering either auth
page, redirects valid users to `/account`, and fails safely during database outages.
This does not grant tenant access or alter API authentication requirements.

## Feature approval gates

The public marketing homepage was approved on 25 October 2026. This UI-only
milestone uses the approved Stitch homepage direction, local fictional wedding
examples and clearly unavailable account actions. It excludes budgets, room
allocation, transport, seating, realtime presence, unverified platform claims
and business integrations. It does not resolve the pending contracts below.

The foundation, marketing homepage and the core authentication slice above are
authorized. The following original authentication checklist is retained for
traceability; items 1–5 are addressed by the slice above, while item 6 remains a
public-launch gate. Other business features still require their affected decisions.

Before the first organizer authentication slice:

1. Approve the endpoint names. The API document proposes `/api/v1/auth/register`,
   `/api/v1/auth/login`, `/api/v1/auth/logout` and `/api/v1/auth/session`; the
   system design uses `signup` instead of `register`. Use one canonical contract,
   not aliases added implicitly.
2. Confirm session policy. The adopted defaults above are a 7-day idle limit and a
   30-day absolute limit. Define timestamps and indexes that
   enforce both independently of asynchronous TTL cleanup.
3. Confirm the host-only cookie name and its Secure, HttpOnly, SameSite and local
   development behavior, plus trusted-origin and session-bound CSRF controls.
4. Define MongoDB-backed authentication rate limits, unique normalized email
   handling, password hashing, revocation and safe error contracts. Registration
   does not require email verification; an unjoined User has null wedding and role.
5. Include explicit indexes, isolated database integration tests and focused
   tests for duplicate email, invalid credentials, expiry and logout. The current
   unit suite does not establish these persistence or security guarantees.
6. Complete password recovery before public onboarding; membership tokens must
   not bypass password authentication.

Before the first wedding-owned operation, approve the affected Wedding fields
and add trusted tenant context, same-wedding reference validation, role checks
and negative tenant-isolation tests in that slice. Include transactions and
replica-set verification when cross-document invariants require them.

Add integration test discovery when integration tests exist, and shared UI
components and expanded design tokens with the first real interface. The other
open decisions above remain pending until their affected milestone is approved.

## Source handling

The four source `.md` files are now genuine Markdown, converted on 24 October
2026 with headings, tables, lists, code examples and the embedded architecture
diagram preserved. Their original wording and provisional decisions remain
unchanged. Byte-for-byte Word originals and SHA-256 hashes are retained in
`docs/source`; the extracted diagram is in `docs/assets`.

Names such as Make My Marriage are historical; ShaadiPilot is the current project
name. The supplied database relationship catalog is available, but no separate
graphical ERD was found. Conversion does not reconcile conflicts or approve
provisional product policies.

## Delivery order

1. Scaffold and checks.
2. Identity, tenancy, membership and the email delivery needed for recovery/invites.
3. Planning modules and public website.
4. Guest invitations, RSVP and approved reminders.
5. Private gallery and QR workflow.
6. Release verification, recovery, quotas, retention and deployment readiness.

Security, tenant isolation and focused tests accompany each phase.
