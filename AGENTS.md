# ShaadiPilot development instructions

- Read the four Markdown source documents and `docs/architecture-decisions.md`
  before changing relevant behavior. Original Word inputs are archived under
  `docs/source`. Surface conflicts; do not silently resolve product decisions.
- Keep one TypeScript Next.js App Router application with Node.js Route Handlers,
  Mongoose and the approved external services.
- Stay within approved V1 scope. Do not add authentication frameworks, another
  ORM, a separate backend or queue infrastructure.
- Browser business writes use `/api/v1`. Keep routes thin, business rules in
  services and database queries in module-owned repositories.
- Derive wedding context from authenticated server state. Scope every tenant
  query and validate all referenced records.
- Enforce roles server-side. Guests have capabilities, not accounts. Do not
  require email verification in V1.
- Keep server code out of client imports. Return explicit DTOs and never log
  credentials, private links, signed URLs or guest records.
- Derive error diagnostics with `describeApiError`; never log exception messages,
  names, stacks, causes or arbitrary provider fields.
- Validate inputs strictly. Use exact money arithmetic and explicit wedding/event
  timezones.
- Use MongoDB transactions for cross-document invariants. Keep external calls
  outside transactions and persist recoverable side-effect state.
- Add focused tests for changed behavior, especially authorization, tenancy,
  concurrency and retries.
- Use npm and the committed lockfile with Node.js 24. Run `npm run check` and
  `npm run build`; report results and limitations.
- Keep changes small. Do not deploy, change external services, commit or push
  unless authorized.
