# ShaadiPilot

ShaadiPilot is a collaborative Indian wedding-planning application. This
repository contains the approved application foundation and public homepage preview.

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

For future database-backed work, copy `.env.example` to `.env.local` and supply
development-only MongoDB credentials and a database name. Never commit secrets.
The database helper validates configuration and connects only when called; imports
and production builds do not contact Atlas.

## Commands

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start Next.js development server             |
| `npm run check`      | Check formatting, lint, types and unit tests |
| `npm run build`      | Produce and type-check the production build  |
| `npm start`          | Serve the completed production build         |
| `npm run format`     | Format project source and configuration      |
| `npm run test:watch` | Run unit tests in watch mode                 |

Type checking runs Next.js type generation first, so it also works on a clean
checkout. CI uses `npm ci` and runs all checks plus a production build without
service credentials. The initial tests exercise safe errors and environment
validation, not live MongoDB or providers.

TypeScript is pinned to the 6.0 line supported by Next.js's bundled lint parser.
ESLint 9 is retained for the React plugin's declared peer compatibility; npm marks
that major deprecated. The [temporary tooling exception](docs/architecture-decisions.md#temporary-tooling-exception)
records its scope, review date and upgrade criteria. Do not install incompatible
peers or bypass checks.

## Structure and boundaries

- `src/app`: Next.js pages, layouts and future HTTP Route Handlers.
- `src/components/marketing`: responsive homepage sections, local example data,
  and the mobile navigation interaction.
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
marketing examples; they never read from wedding records. Account creation and
login are marked as coming soon. In-page navigation works, but the previews do
not create accounts, send invitations, publish websites or upload photos.
Images and fonts are served locally, so the homepage requires no external
services, runtime provider requests or service credentials. Font licenses and
asset provenance are included under `public`.

Included: a simple app shell, strict TypeScript, ESLint, Prettier, Vitest, CI,
on-demand environment validation, a lazy cached Mongoose connection, and API
response/error/tracing helpers.

Business API routes, authentication, database models/index scripts, provider
integrations, cron processing and deployment are later implementation phases.
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
index scripts, replica-set integration tests and live connection validation must
accompany the first persistence feature. Database credentials never belong in
client components or `NEXT_PUBLIC_*` variables.

Use isolated databases, R2 buckets and provider credentials for development,
preview/staging and production. Store deployment secrets in the appropriate
Vercel environment. Provider placeholders in `.env.example` are reserved for later
phases; they are not consumed or validated by this scaffold.

## Project documents

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
