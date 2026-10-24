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

## Open product and contract decisions

| Topic                  | Conflict or missing decision                                                                                                     | Proposal awaiting confirmation                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Admin policy           | PRD leaves Admin onboarding and transfer open; later contracts provisionally support it                                          | Admin may manage other Admins, with last-Admin protection                        |
| Guest entry            | PRD shows multiple invited functions from one link; technical contracts issue per-event capabilities and a separate gallery link | Confirm the entry experience before implementing capability contracts            |
| Guest email            | PRD requires email; API permits manually shared contacts without email                                                           | Confirm requiredness; duplicate family emails also need a policy                 |
| Wedding date           | Required in PRD but absent from detailed Wedding storage and creation contracts                                                  | Model an explicit wedding calendar date with wedding timezone                    |
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

## Feature approval gates

The public marketing homepage was approved on 25 October 2026. This UI-only
milestone uses the approved Stitch homepage direction, local fictional wedding
examples and clearly unavailable account actions. It excludes budgets, room
allocation, transport, seating, realtime presence, unverified platform claims
and business integrations. It does not resolve the pending contracts below.

The foundation and marketing homepage are approved. Authentication and other
business features still require the affected decisions below; recording these
gates does not approve provisional policies.

Before the first organizer authentication slice:

1. Approve the endpoint names. The API document proposes `/api/v1/auth/register`,
   `/api/v1/auth/login`, `/api/v1/auth/logout` and `/api/v1/auth/session`; the
   system design uses `signup` instead of `register`. Use one canonical contract,
   not aliases added implicitly.
2. Confirm session policy. The proposed defaults are a 7-day idle limit and a
   30-day absolute limit; they remain pending. Define timestamps and indexes that
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
