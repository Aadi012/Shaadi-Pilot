# ShaadiPilot

ShaadiPilot is a collaborative Indian wedding-planning application. This
repository contains the application foundation, public homepage and core organizer
authentication.

## Local development

Use Node.js 24.x and npm 11.19.1. The Node major is recorded in `.nvmrc` and
the npm version in `package.json`. CI installs that exact npm release before
installing project dependencies.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The initial page works without environment files or
external services. If Windows cannot find npm, add your existing Node.js
installation to your shell's PATH, then open a new terminal.

For account access, copy `.env.example` to `.env.local` and supply
development-only MongoDB credentials and a database name. Never commit secrets.
The database helper validates configuration and connects only when called; imports
and production builds do not contact Atlas.

Before using registration, run `npm run db:auth:indexes`. This idempotently creates
the v1 indexes without dropping existing indexes or records. Authentication fails
closed if its required indexes are absent. Atlas must support transactions.
Set `APP_BASE_URL` to the exact application origin (HTTPS in production).
Local development accepts `localhost` and `127.0.0.1` on the configured port.

## Commands

| Command                    | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Start Next.js development server                                                |
| `npm run check`            | Check formatting, lint, types and unit tests                                    |
| `npm run build`            | Produce and type-check the production build                                     |
| `npm start`                | Serve the completed production build                                            |
| `npm run format`           | Format project source and configuration                                         |
| `npm run test:watch`       | Run unit tests in watch mode                                                    |
| `npm run db:auth:indexes`  | Create required authentication indexes                                          |
| `npm run test:integration` | Test auth against an isolated Atlas database                                    |
| `npm run test:http`        | Build and test the real Next.js HTTP adapter against an isolated Atlas database |

`test:http` needs the configured MongoDB connection URI, but creates its own
random test database and starts a separate loopback-only production server. It
disables email sending, checks empty/nonempty DELETE payloads and removal/session
revocation, then stops its server and drops only that exact test database. The
Node HTTP client supplies the trusted HTTPS origin/cookies to emulate TLS
termination; this tests Next's request adapter, not browser/TLS behavior.

Type checking runs Next.js type generation first, so it also works on a clean
checkout. CI uses `npm ci` and runs all checks plus a production build without
service credentials. The initial tests exercise safe errors and environment
validation and authentication policies. The separate integration command loads
local MongoDB credentials and creates a uniquely named `sp_auth_test_*` database,
then removes only that generated database. It never resets the configured
development database. Its database user needs permission to create/drop this
isolated database. Integration tests are opt-in; credentialless CI runs unit tests.

TypeScript is pinned to the 6.0 line supported by Next.js's bundled lint parser.
ESLint 9 is retained for the React plugin's declared peer compatibility; npm marks
that major deprecated. The [temporary tooling exception](docs/architecture-decisions.md#temporary-tooling-exception)
records its scope, review date and upgrade criteria. Do not install incompatible
peers or bypass checks.

## Structure and boundaries

- `src/app`: Next.js pages, layouts and HTTP Route Handlers.
- `src/components/marketing`: responsive homepage sections, local example data,
  and the mobile navigation interaction.
- `src/components/auth`: organizer login/signup forms and reusable form fields.
- `src/modules/auth`: strict contracts, identity/session models, queries,
  authentication services, password/CSRF controls and HTTP adapters.
- `public/marketing` and `public/fonts`: local marketing imagery and licensed fonts.
- `src/modules`: feature modules introduced when their behavior is implemented;
  see [module conventions](src/modules/README.md).
- `src/lib`: shared API, configuration, database and logging infrastructure.
- `tests/unit`: foundation tests. Integration and browser tests follow with
  business features.
- `docs`: architectural inputs and the [decision record](docs/architecture-decisions.md).

The approved stack is TypeScript, Next.js App Router, Node.js, MongoDB Atlas with
Mongoose, custom sessions, Cloudflare R2, Resend, Google Places and Vercel. This is
one modular monolith, with browser business writes through explicit `/api/v1`
endpoints. Server-rendered reads may invoke the same authorized services directly.

An organizer belongs to zero weddings during onboarding and at most one thereafter.
The wedding is the tenant boundary. Admin and Manager can manage planning; Admin
alone manages membership. Guests have scoped bearer links and no accounts. Email
verification is not required in V1.

## Scaffold scope

The public homepage follows the approved Stitch reference with V1-only content.
Wedding names, tasks, headcounts, expenses and theme previews are fictional
marketing examples; they never read from wedding records. The `/signup` and
`/login` pages now create accounts and authenticate using MongoDB-backed opaque
sessions. Successful authentication opens the protected `/account` page. Refresh
restores the session; logout revokes it in MongoDB and clears the cookie.
Unjoined organizers continue to `/onboarding`, then `/onboarding/details` to create
their wedding; joined organizers see the private overview at `/account`.
Recovery is marked as coming soon and remains a public-launch prerequisite.
Images and fonts are served locally, so the homepage requires no external
services, runtime provider requests or service credentials. Font licenses and
asset provenance are included under `public`.

Included: a simple app shell, strict TypeScript, ESLint, Prettier, Vitest, CI,
on-demand environment validation, a lazy cached Mongoose connection, and API
response/error/tracing helpers.

Planning CRUD, provider integrations, cron processing and deployment
remain later implementation phases.
`withApiHandler` supplies tracing, safe error responses and private cache headers;
it **does not authenticate, authorize, enforce CSRF or validate request input**.
Those controls are required before future protected routes call services. Public
cacheable routes will need a separate explicit caching policy.

API messages placed in `ApiError` are deliberately public. Unexpected error text,
stacks, raw request URLs, request bodies and provider payloads are excluded from
the foundation logger. The wrapper adds safe `errorCategory` and `errorCode`
diagnostics derived from trusted exception classes and an allowlist of public
codes. Unknown codes use a fixed fallback; exception names, messages and causes
are never copied into diagnostics. These fields share the response's request ID.
Always pass fixed route templates into the wrapper.

The connection helper disables automatic index creation in production. Versioned
indexes are applied explicitly by the authentication setup script. Database credentials never belong in
client components or `NEXT_PUBLIC_*` variables.

## Organizer authentication

- `POST /api/v1/auth/register`: `{ displayName, email, password }`, returns the
  same generic 202 response for new and existing emails, without a session.
  Continue to `/login` afterward. Existing passwords and profiles are never replaced.
- `POST /api/v1/auth/login`: `{ email, password }`, returns 200.
- `GET /api/v1/auth/session`: `{ user, csrfToken }` inside the standard `data`
  envelope; anonymous requests return `user: null` and bootstrap CSRF.
- `POST /api/v1/auth/logout`: revokes the current session, returns 200.

Mutations require the configured `Origin` and `X-CSRF-Token` from the session
endpoint. Tokens are bound to the current session, or an HttpOnly anonymous CSRF
cookie before authentication. JSON bodies are bounded to 8 KiB. No CORS origins
are enabled. Responses use `Cache-Control: no-store` and safe error envelopes.

Passwords use Argon2id (19 MiB, two iterations, parallelism one), with a 15-character
minimum and 128 UTF-16 code-unit maximum; passwords are never trimmed or truncated.
Email is trimmed/lowercased and uniquely indexed. Registration status, public body
and cookies do not disclose whether the email was already registered. Invalid
login is generic. New users have null wedding
and role, and no email-verification requirement.

Authenticated visitors to `/login` and `/signup` redirect server-side to
`/account`. Expired/revoked sessions see the forms; database outages show a safe
unavailable message. These pages are dynamic and do not cache identity publicly.
Generic signup responses reduce direct enumeration; without email verification,
registration followed by a login attempt with the chosen password can still
distinguish a new account from an existing one. Timing is not guaranteed identical.

Only SHA-256 hashes of 256-bit random session secrets are stored. Session cookies
are HttpOnly, SameSite=Lax, host-only and Path=/; production uses Secure and
`__Host-shaadipilot_session`, local HTTP uses `shaadipilot_session`. The server
enforces seven-day idle and 30-day absolute expiry independently of TTL cleanup.
Successful reauthentication rotates and revokes the presented session; other
devices remain signed in. Session reads check user status and extend activity at
most once per minute. Never use a session DTO as a cached authorization decision.

MongoDB fixed-window limits apply per normalized email and trusted network key:
login 10/account and 50/network; registration 5/account and 20/network per 15
minutes. Vercel's overwritten `x-vercel-forwarded-for` supplies the network key.
Outside Vercel, a conservative shared bucket is used; arbitrary forwarded headers
are ignored. Review this adapter before hosting behind another proxy. Fixed
windows permit boundary bursts; hosting-level abuse controls remain necessary
before public launch. Password hashing is additionally bounded per process.

**Public onboarding still requires live recovery-email verification and deployment
delivery configuration.** Recovery is implemented with mocked provider tests; see
[password recovery setup](docs/password-recovery.md) for the remaining release work.
Live password-recovery verification and breached-password screening remain
release work. Manager invitations are implemented; see below. Wedding creation and tenant-scoped overview reads are supplied
by the onboarding slice below. A random opaque
session needs no `SESSION_SECRET`; future signed/encrypted links need separate
purpose-specific key configuration. Do not add a public auth secret variable.

Use isolated databases, R2 buckets and provider credentials for development,
preview/staging and production. Store deployment secrets in the appropriate
Vercel environment. Provider placeholders in `.env.example` must never hold real credentials.
Resend and token-encryption settings are now validated lazily by recovery; other
provider settings remain reserved for later modules.

## Wedding onboarding and overview

Run `npm run db:wedding:indexes` once per environment before using wedding setup.
It creates the unique wedding-slug index and durable creation-receipt collection
without dropping records or indexes. Runtime readiness checks fail closed if the
required setup is absent. Creation requires Atlas transactions.

`POST /api/v1/weddings` accepts `displayNames: {partnerOne, partnerTwo, intro?}`,
`weddingDate` (`YYYY-MM-DD`), `location`, `timezone` and `slug`. Supply the current
CSRF token, trusted Origin and UUID `Idempotency-Key`. New creation returns 201;
matching retries return 200. A changed payload with the same key returns 409.
The wedding and its first Admin membership commit atomically; conflicting
requests cannot attach one organizer to two weddings. Publication defaults false.

`GET /api/v1/weddings/current` resolves membership from the authenticated User.
`GET /api/v1/weddings/slug-availability?slug=...` is an authenticated reservation
check and never returns wedding/owner details. Client tenant IDs and roles are
not accepted. The overview includes wedding-scoped counts, upcoming functions and
task completion/overdue summaries. RSVP aggregation and nonempty expense totals
remain later slices. Future actions are labelled unavailable. Setup inserts no
sample planning records.

The [approved design references](docs/designs/README.md) and
[design language](docs/DESIGN.md) document the implementation. `npm run design:check`
checks live Stitch access without printing credentials. See those instructions
for the read-only fallback and optional export refresh. The application never
needs Stitch credentials or network access at runtime or build time.

## Organizer collaboration

Use `http://localhost:3000` consistently for local browser and emailed links,
matching `APP_BASE_URL`. The exact loopback hostname `127.0.0.1` is also allowed
for Next development assets/HMR; no wildcard development origins are enabled.

Run `npm run db:membership:indexes` after the existing auth/wedding/recovery setup.
The Admin Team page supports Manager invitations, pending revocation and Manager removal; matching
accounts explicitly accept through `/join`. No membership is created from a link
alone. See [Manager invitation setup and contracts](docs/organizer-invitations.md).
One real email-to-acceptance flow was verified locally on 27 October. An owned,
verified sender domain, scheduler configuration and release monitoring are still
needed for general customer sending. Removal transactionally revokes sessions and
old invitations; stale versions cannot remove a later rejoined membership.
Functions and Tasks are implemented for review; see the [V1 roadmap](docs/roadmap.md).

## Planning modules

Use `/account/functions` and `/account/tasks` for authenticated wedding planning.
Both organizer roles can manage these records. Run `npm run db:events:indexes`
and `npm run db:tasks:indexes` once per environment after the existing setup;
these scripts add indexes without removing records.

Functions and Tasks create requests require a UUID `Idempotency-Key`, the current
CSRF token, trusted Origin and `X-Wedding-Context` stale-tab guard. The server
derives the actual tenant from fresh authenticated membership. Matching retries
do not create duplicates; changing the payload under the same key returns 409.
Edit/remove requests require a strong quoted numeric `If-Match` version.

Task deadlines are optional UTC instants entered/displayed in the wedding timezone.
Removed Manager assignments retain their history with “Former organizer — reassign”.
Task removal archives the record and excludes it from active lists and summaries.
Function removal remains blocked by linked records, including archived task history;
no reference cleanup or cascade deletion is performed. See [Tasks plan](docs/tasks-plan.md)
and [project status](docs/project-status.md) for verification and remaining review.

## Guest contacts

The private Guest directory is at `/account/guests`. Run
`npm run db:guests:indexes` per environment after existing setup. Both organizer
roles can create/edit/archive contacts, search name/email and select functions.
Email is required; shared family mailboxes warn without merging contacts.
Selections are planning intent; this slice creates no invitations, sends no mail
and grants no guest access. Existing access references block removal or changes
to email/function selections until the revocation workflow is implemented.
The [Guest plan](docs/guests-plan.md) documents REST and concurrency contracts.

## Project documents and progress

Implementation milestones, verification results and remaining work are tracked
in [project status](docs/project-status.md). Update it alongside each major feature.

The PRD, system design, database design and API design are readable Markdown at
`docs/prd.md`, `docs/system-design.md`, `docs/database-design.md` and
`docs/api-design.md`. Their headings, tables, lists, code examples and architecture
diagram were converted from the supplied Word data. The original wording,
historical product names and provisional decisions are retained.

Byte-for-byte Word originals and their SHA-256 hashes are retained in
[docs/source](docs/source/README.md). The extracted diagram lives in `docs/assets`.
The Markdown files are formatted normally; embedded source examples are excluded
from automatic language reformatting to preserve their content. The database
document has a relationship catalog; no separate graphical ERD was supplied.

Outstanding product decisions are recorded in
[architecture-decisions.md](docs/architecture-decisions.md). Scaffold approval
does not silently approve provisional defaults in the source documents.

Before implementing the first business feature, complete the
[feature approval gates](docs/architecture-decisions.md#feature-approval-gates).
