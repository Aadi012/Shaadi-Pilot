# ShaadiPilot project status

Last updated: 29 October 2026 (Asia/Kolkata).

This is the implementation progress record. The [PRD](prd.md) defines product
scope; [architecture decisions](architecture-decisions.md) record accepted
contracts and unresolved choices. A status entry does not approve new scope or
resolve an open product decision.

## Current position

Guest contacts and planned function selection, including the review corrections,
were accepted for commit/push on 29 October. Functions and Tasks are already on
dev. The latest Guest checks pass 85 unit/render tests, formatting, lint and types;
see milestone 12 for persistence/HTTP evidence and browser limitations. Private
guest invitations and RSVP are the next authorized feature, with access-policy
decisions being confirmed before implementation.

Manager removal is complete for the approved slice following user authorization
on 27 October. Documentation handoff resumed on 28 October after a tooling usage
interruption. See milestone 9. The accepted real test membership is preserved.

Manager invitation/revocation/acceptance is implemented. On 27 October the user
configured Resend and confirmed receipt, explicit acceptance and overview
navigation for one real invitation. Read-only MongoDB checks confirmed the
accepted invitation and Manager membership. Current `npm run check` passes 64 unit/render
tests; all 70 isolated MongoDB integration tests and six real-HTTP regression tests pass; production build passes
with database/email credentials blanked. See milestone 8 and the
[incremental V1 roadmap](roadmap.md). The test wedding remains available because
it now contains the user's real test membership. Do not remove it implicitly.

Password recovery remains verified with mocked provider delivery; its live email
round trip is still unverified. See milestone 7 and the
[recovery setup guide](password-recovery.md). Previously completed recovery/settings
work was authorized for commit/push on 27 October and committed as
[ff4e1a6](https://github.com/Aadi012/Shaadi-Pilot/commit/ff4e1a6357d99adb47400205342e6b6a7e0ca3a5) and pushed to origin/dev; both commit IDs were verified equal.
No production deployment is included.

Wedding details editing is complete for this slice following approval of the new
Stitch screens on 26 October. Settings is available to Admins and Managers;
the wedding address remains locked and existing functions are never rescheduled.
See milestone 6 for delivered scope and verification. Wedding editing, recovery
and the account-switch correction are included in this approved delivery.

Wedding onboarding and the initial private overview are complete for their first
slice following the user's approval of the desktop/mobile Stitch designs. The implementation
covers creation and the empty workspace; populated planning modules remain later
features. Verification: 42 unit/render tests and 24 isolated MongoDB integration
tests pass, along with formatting, lint, types and a production build. Browser
checks covered creation, persistence, repeat-setup redirects, validation, slug
availability and mobile navigation, with no page overflow at 320px and 390px.
The user reviewed and accepted this slice and authorized its commit and push to
GitHub on 25 October 2026. No additional feature implementation is authorized by
this delivery approval.

The application foundation and public marketing homepage are complete for their
approved scope. Organizer registration and MongoDB-backed login/session/logout
are complete for the core authentication slice. New and duplicate signup attempts
receive the same generic response without automatic sign-in; users continue to
login. Valid signed-in visitors to login/signup redirect to `/account`.
The user confirmed manual testing and code review are complete and approved this
work for commit and push on 25 October 2026. That authentication milestone passed:
34 unit/render tests, 12 isolated MongoDB integration tests, formatting, lint,
type checking and the production build.
Planning-module CRUD remains unimplemented. The Resend adapter is implemented
and mock-tested; live external delivery remains unverified.
No production deployment is recorded.

## Milestone history

| Completed       | Milestone                                   | Status                     | Commit                                                                                             |
| --------------- | ------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| 24 October 2026 | Project scaffold and engineering foundation | Complete                   | [21f0dd6](https://github.com/Aadi012/Shaadi-Pilot/commit/21f0dd6372aeef4ee39c71a0337e402c89f00410) |
| 25 October 2026 | Public marketing homepage                   | Complete — UI preview      | [13beba3](https://github.com/Aadi012/Shaadi-Pilot/commit/13beba33431a5ece8136ecc9b996cd22c48bd323) |
| 25 October 2026 | Organizer login and signup                  | Complete — UI preview      | [6bccc20](https://github.com/Aadi012/Shaadi-Pilot/commit/6bccc20dd6b44e1938b64ab509f4c0e343d83403) |
| 25 October 2026 | MongoDB-backed organizer authentication     | Complete — core auth       | [6bccc20](https://github.com/Aadi012/Shaadi-Pilot/commit/6bccc20dd6b44e1938b64ab509f4c0e343d83403) |
| 25 October 2026 | Wedding onboarding and initial overview     | Complete — first slice     | [c74af42](https://github.com/Aadi012/Shaadi-Pilot/commit/c74af422de510da0ee761958411a41428937776b) |
| 26 October 2026 | Wedding details editing                     | Complete — first slice     | [ff4e1a6](https://github.com/Aadi012/Shaadi-Pilot/commit/ff4e1a6357d99adb47400205342e6b6a7e0ca3a5) |
| 27 October 2026 | Password recovery and durable reset email   | Complete — mocked delivery | [ff4e1a6](https://github.com/Aadi012/Shaadi-Pilot/commit/ff4e1a6357d99adb47400205342e6b6a7e0ca3a5) |

Milestones 1–3 describe behavior at their original delivery date. Milestone 4 and
its follow-up supersede the UI preview's account restrictions and password rules.
The feature commit is recorded in Git history; no production deployment is implied.

### 1. Project scaffold and engineering foundation

- One TypeScript Next.js App Router application on Node.js 24, organized for a
  modular monolith with future REST APIs under `/api/v1`.
- Strict TypeScript, ESLint, Prettier, Vitest and a GitHub Actions CI workflow.
- Environment validation, lazy Mongoose connection infrastructure, safe logging
  and API response/error helpers.
- Architectural source documents, preserved Word originals, module conventions,
  repository instructions and a record of unresolved decisions.
- Validation: formatting, lint, type checking, 16 foundation unit tests and a
  production build passed after foundation improvements.
- Boundary: infrastructure helpers are not implemented authentication,
  authorization, tenant isolation, database models or business endpoints.

### 2. Public marketing homepage

- Responsive homepage based on the approved Google Stitch reference, with hero,
  workspace preview, V1 feature cards, family collaboration, guest journey,
  website theme previews, setup steps and closing CTA.
- Consistent branding, locally served Newsreader/Manrope fonts and marketing
  images, with font licences and asset provenance included.
- Working section navigation and mobile menu, keyboard focus styles, skip link
  and reduced-motion support.
- Clearly labelled fictional wedding data; account creation and login are
  marked as coming soon. The illustrated dashboard and themes are not functional
  organizer pages or a website builder.
- Excludes room allocation, transport, seating, budgets, realtime presence and
  unsupported platform claims.
- Validation: `npm run check` passed (formatting, lint, types and all 16 existing
  foundation tests); `npm run build` passed. Browser checks covered desktop,
  tablet and mobile layouts down to 320px, image loading and navigation.
- Boundary: no business APIs, database reads/writes or provider integrations were
  introduced. The existing unit tests are not an automated homepage browser suite.

### 3. Organizer login and signup UI

- Public `/login` and `/signup` pages follow the previously inspected Stitch
  split-layout direction, using the homepage brand, locally served fonts and
  approved marketing imagery. Live Stitch access required authentication during
  this milestone, so no newly fetched assets or design revisions are claimed.
- Shared form fields provide required-field/email checks, signup password
  confirmation, independent visibility controls, accessible errors, keyboard
  submission and explicit pending/result preview states.
- Homepage login and planning CTAs open the appropriate pages. Users can switch
  between login and signup, return home or explore homepage features.
- Form submission validates locally, clears passwords and explicitly states that
  no sign-in or account creation occurred. No API calls, database operations,
  credential persistence or authentication cookies are implemented. Controls are
  disabled before JavaScript hydration to prevent native credential submission.
- The eight-character signup guideline is a UI demonstration, not an approved
  backend password policy. Password recovery is visibly unavailable; no recovery
  page or dead link was added. Wedding creation and email verification were not
  introduced.
- Validation: `npm run check` and `npm run build` passed. All 24 unit/render
  tests pass, including 8 new checks for preview
  validation and the no-JavaScript form safeguard. Manual browser checks cover
  field errors, confirmation mismatch, password visibility, keyboard submission,
  pending/completion feedback, password clearing and account navigation. Mobile
  layouts were checked down to 320px without horizontal overflow.
- At delivery, backend authentication remained pending. That work and its
  contracts were subsequently authorized and delivered in milestone 4 below.

### 4. MongoDB-backed organizer authentication

- User-authorized registration, login, session lookup and logout under
  `/api/v1/auth`, wired to the existing forms, plus a minimal protected `/account`
  confirmation page. New accounts have null wedding and role; no email verification.
- Argon2id password hashes, normalized unique email, 256-bit opaque sessions
  stored as hashes, HttpOnly cookies, seven-day idle / 30-day absolute expiry,
  session-bound CSRF, trusted origins and atomic MongoDB rate limits.
- Explicit additive index setup, runtime index readiness checks, transactional
  account/session creation and session rotation. Credentials remain server-only.
- Initial verification: 31 unit/render tests and 12 isolated Atlas integration tests passed,
  covering concurrency, invalid inputs, CSRF, expiry, disabled users, logout,
  transaction rollback, rate-limit responses and production cookie attributes.
  Formatting, lint, types and the production build pass. Manual browser checks
  verify signup, invalid/valid login, refresh persistence, logout and denial of
  logged-out account access. The generated integration database is removed after
  the suite; development records are not reset. Disposable browser fixtures are
  removed after verification. This is not a production deployment or load test.
- Boundary: no recovery emails, wedding setup, organizer dashboard or tenant-owned
  operations. Password recovery is required before public onboarding. See the
  [authentication decisions](architecture-decisions.md#organizer-authentication-slice--25-october-2026).
- Manual-test follow-up (25 October): replaced explicit duplicate-email errors
  with matching generic 202 responses for new/duplicate signup, without automatic
  sign-in. Existing profiles/passwords remain unchanged; users continue to login.
  Signed-in visitors to login/signup redirect server-side to `/account`; database
  outages show a safe message. Regression verification: 34 unit/render tests and
  12 isolated MongoDB integration tests pass. Browser checks confirm matching
  new/duplicate signup feedback, original-password preservation and both auth-page
  redirects. Formatting, lint, types and production build pass. Generic
  responses reduce direct disclosure but do not eliminate probing via subsequent
  login without email verification. Hashing, cookie and revocation checks are
  automated integration evidence, not claims about the user's manual testing.

### 5. Wedding onboarding and initial overview — 25 October 2026

- Approved Stitch welcome, wedding details and desktop/mobile overview references
  retrieved and inspected. Connection fallback and local references documented.
- Two-step setup, private wedding creation, first-Admin membership, trusted tenant
  reads and responsive empty overview implemented. Loading, pending, validation
  and safe error/retry states are included. No guest accounts, publication,
  planning CRUD, membership invitations or email integration in this slice.
- Wedding date is an explicit calendar date, paired with the wedding timezone;
  approved setup fields include manually entered location, slug and optional intro.
- Verification: `npm run check` passes (42 unit/render tests); the separate MongoDB
  suite passes all 24 integration tests, including concurrent creation, duplicate
  slug rollback, replay/conflict handling, membership refresh and tenant isolation.
  `npm run build` passes with database credentials blanked. Browser checks covered
  welcome/details/overview, field errors, address availability, successful creation,
  native date entry, refresh, repeat-setup redirects and mobile drawer focus.
- The developer `npm run design:check` fallback successfully retrieved the live
  project with 14 screens; its export-refresh command also passed. Eight approved
  design exports are stored locally.
  Exposed MCP tools still returned an authentication error; their root cause is
  not claimed resolved. No credentials were copied or configuration rewritten.
- Boundaries: no populated demo records, planning actions or member invitation
  workflow. Nonempty expense totals and detailed planning summaries remain later
  work. Disposable test fixtures were removed after verification. The user accepted
  the delivered feature and authorized commit/push on 25 October 2026; the commit
  is recorded in Git history. No production deployment is included.

### 6. Wedding details editing — 26 October 2026

- User approved the two Settings → Wedding details Stitch references and
  authorized implementation. Desktop/mobile originals are archived under
  docs/designs/wedding-details; the existing direct MCP fallback retrieved them.
- Protected settings page at /account/settings/wedding, linked from the workspace
  sidebar. Both roles may edit couple names, date, manual destination, planning
  timezone and optional introduction. The slug is read-only. No publication,
  website customization, membership management or external integration is added.
- PATCH /api/v1/weddings/current uses trusted session membership, Origin/CSRF,
  rate limiting, strict validation and atomic version comparison. Stale saves
  return 412 and preserve the draft; review latest requires explicit discard.
  Save failures retain draft input. Unsaved changes prompt before leaving.
- Changing date/timezone leaves existing event records unchanged. Optional
  introductions are limited to 200 characters. Save is disabled while pristine,
  before hydration and while pending. Page loading uses the existing account loader.
- Verification: npm run check passes (formatting, lint, strict types and 44
  unit/render tests); npm run test:integration passes all 28 isolated Mongo tests.
  The final production build passes with database credentials blanked. Browser
  checks verify saving, persistence after reload, required-field validation,
  two-tab conflict/review/discard, keeping and discarding unsaved edits, and
  navigation after discard. Mobile widths 320px and 390px have no horizontal
  page overflow; the checked page has no console warnings/errors. Disposable
  browser fixtures were removed. A Windows/OneDrive generated-manifest cleanup
  failure was resolved by removing only its verified generated directory.
- Boundary: drafts are memory-only and not recoverable after closing/reloading.
  Public website propagation awaits the website feature. No email, invitations,
  commit, push or production deployment in this slice.

- Account-switch correction (27 October): before saving wedding details, the
  client checks that refreshed session membership matches the draft's wedding.
  Mismatched/unjoined accounts cannot submit the draft; signed-out sessions and
  failed session refreshes also stop before PATCH. Latest-details review rejects
  responses from a different wedding. The draft is preserved with a clear message.
  Regression checks cover switched wedding, null membership, logout, failed
  refresh and the successful matching-wedding path. `npm run check` passes all
  55 unit/render tests; the production build passes with provider credentials
  blanked. This is a client correction; server authorization is unchanged.

### 7. Password recovery — 26 October 2026

Status: Complete — implementation and mocked verification (27 October); live
email delivery deferred by user.

- User approved the recovery brief and finalized Stitch project 14249455352497050706. Four desktop/mobile references were retrieved and inspected;
  exports are in docs/designs/password-recovery. Unsupported generated passkey,
  encryption and state-inspector content is excluded.
- Forgot/reset pages, login link, account-safe request confirmation, validation,
  invalid/expired outcome, password visibility, pending/error and success states
  are implemented. Links use fragments, are cleared from the address bar and
  remain in memory only. No automatic login or email verification is introduced.
- REST request/validate/confirm APIs use strict schemas, trusted Origin, CSRF,
  MongoDB rate limits, hashed 30-minute tokens and transactional password change,
  credential-version advancement, reset invalidation and session revocation.
- Platform email uses encrypted immutable one-message batches, bounded owner-bound
  leases, identical Resend retry keys, bounded attempts, cancellation and terminal
  payload removal. Next after dispatch and a protected internal drain are included.
  No reminder/invitation features, production scheduler or external configuration.
- User approved keeping secrets in ignored local configuration and later chose
  mocked provider verification. The initial check misread blank assignments as
  populated settings; corrected checks found Resend credentials/sender empty.
  Local encryption and cron secrets were generated privately. No real email sent.
- Current checks: 51 unit/render and 45 isolated MongoDB integration tests pass,
  along with formatting, lint and strict types. Browser checks cover required
  validation, login navigation, unavailable service, valid/invalid links, fragment
  removal, same-tab link reopening and no overflow at 320px/390px. The production
  build passes with database/email credentials blanked. Password submission/success
  are integration evidence rather
  than a completed manual browser password change. Disposable browser fixtures
  were removed; the existing development accounts were not modified.
- Remaining release work: configure Resend sender/key, validate a real email round
  trip and email-client fragments, configure timely retry invocation and monitor
  failures. See [setup and limits](password-recovery.md). The user authorized commit
  and push on 27 October; no deployment is included.

### 8. Manager invitations — 27 October 2026

Status: Complete — Manager invitation slice and one local live email flow;
broader membership administration and production readiness remain outstanding.

- After requesting commit/push of completed work, the user authorized starting
  the next feature. The first slice is Admin invitation of Managers, pending
  invitation list/revocation and account-bound acceptance; existing member removal
  and second-Admin policy are outside this slice.
- Created a [scoped implementation plan](organizer-invitations-plan.md) and
  [ready-to-paste Stitch prompt](designs/organizer-invitations-prompt.md) covering
  desktop/mobile Team, form, revoke, join states and an email reference.
- User supplied finalized designs. Stitch listed 56 screens; three desktop Team,
  invite/revoke and acceptance references were retrieved and visually inspected.
  Exports are in docs/designs/organizer-invitations. No dedicated mobile Team
  design was listed. Existing responsive shell/styles guide adaptation.
- Delivered Admin Team page with real organizer/invitation lists, fixed Manager
  form, pending revocation and truthful mail statuses. Private join states cover
  login/signup return, wrong email, unavailable link, another wedding, explicit
  acceptance and already-member/retry behavior. No automatic membership grants.
- REST services, module-owned Mongoose persistence and additive explicit indexes
  enforce fresh Admin roles, trusted wedding scoping, stale-tab context guards,
  seven-day hashed capabilities, durable idempotency and conditional one-wedding
  membership. Transactions serialize revoke/accept and competing memberships.
  Temporary 15-minute HttpOnly cookies carry invitation intent through login.
- Reused encrypted immutable email batches for wedding-scoped invitations. Newly
  queued work uses Next after; protected drain supports two resets plus three
  invitations. No new dependencies or production scheduler were added. Required
  development indexes were applied without deleting existing records/indexes.
- Checks: npm run check passes 56 unit/render tests; npm run test:integration
  passes 63 isolated tests, including 18 membership cases. Tests cover Admin and
  tenant isolation, concurrent deduplication and acceptance, competing weddings,
  revoke/accept races, rollback, expiry, invalid identities, HTTP Origin/CSRF,
  private cookies, fixed login return, pagination and immutable mock-mail retries.
  Production build passes with database/email credentials blanked after removing
  only the verified generated .next/server output that hit OneDrive EPERM.
- Browser checks confirmed Admin Team navigation/list rendering, native invitation
  dialog, required-email validation, revoke confirmation/cancel and Escape focus
  return. Checked 320px/390px layouts have no horizontal page overflow. No console
  warnings/errors were captured on the checked localhost page. Other join states
  and final revocation are integration evidence rather than full manual coverage.
  A separate 127.0.0.1 dev visit encountered Next's dev-origin restriction;
  the exact loopback hostname was added to allowedDevOrigins for local assets/HMR.
  A reload verified hydrated Team controls on 127.0.0.1 after this fix.
  Email links continue to use the configured APP_BASE_URL consistently.
  The user confirmed the actual received email, matching
  account acceptance and overview navigation; DB checks confirmed the outcome.
  A clearly named test wedding and synthetic review accounts are intentionally
  retained while it contains the user's accepted membership.
- Remaining: Admin removal of existing Managers (PRD requirement), owned verified
  sender domain for general recipients, scheduled drain/monitoring, broader email
  client and mobile checks, retention/deletion workflows and live recovery email
  verification. Current Resend test sender is suitable for account-owner testing.
  No new commit, push or deployment was performed for this slice.

### 9. Admin removal of Managers — 27 October 2026

Status: Complete — Manager-only removal and transaction/responsive UI verification;
handoff finalized 28 October.

- User authorized this next slice, followed by Functions/events. Reuses the
  inspected Team design's Remove control and existing responsive native dialogs.
- Scope: Admin removes only Managers in their current wedding. Transactionally
  detach membership, revoke sessions and invalidate old invitations. Preserve
  accounts, existing planning records and the user's accepted real test membership.
- Per-user membership versions advance on join/removal; strict If-Match blocks
  stale removal after rejoining. Legacy missing versions are zero. No new
  dependencies, indexes, Admin-role changes or removal emails.
- DELETE /api/v1/members/{userId} requires fresh Admin membership, Origin/CSRF,
  expected wedding and strong quoted member-version If-Match. Managers, Admin
  targets and foreign members are denied. Missing/malformed/stale preconditions
  fail closed. Cancel, pending/error states and list refresh are implemented.
- npm run check passes formatting, lint, strict types and all 57 unit/render tests.
  All 70 isolated MongoDB integration tests pass, including seven removal cases:
  session revocation, Admin-session preservation, accepted/pending invitation
  invalidation, retained credentials/records, direct authorization/tenant/HTTP
  checks, legacy versions, safe rejoining, stale generations, concurrency and
  rollback. No real email was sent for this slice.
- Production build passes with database/email credentials blanked. Browser checks
  verify Manager-only buttons, named confirmation, Keep Manager/Escape focus
  return and no horizontal overflow at 320px/390px. Actual deletion is verified
  in isolated integration tests; no existing development membership was removed.
- Boundaries: account and historical assignments remain; former-assignee handling
  belongs to Tasks. Previously rendered data/in-flight authorized work cannot be
  recalled, but old sessions are denied on subsequent requests. Admin transfer,
  role changes and Functions/events are not implemented here. No commit/push or
  deployment was performed.

- Runtime correction (28 October): the user found that confirmation failed with
  400 INVALID_REQUEST because Next's Node adapter supplied a non-null empty body
  stream. The earlier direct-handler tests and Cancel/Escape browser checks did
  not prove successful browser deletion. A new running-server test reproduced the
  old failure for omitted, empty-string and empty-stream DELETE content.
  The guard now reads to EOF or rejects/cancels on the first payload bytes without
  buffering arbitrary bodies. Nonempty content, including whitespace, stays 400.
- Corrected verification: all 64 unit/render tests and 70 existing integration
  tests pass. `npm run test:http` builds and starts the real Next.js server against
  a disposable Atlas database; all six HTTP cases pass. Successful removals clear
  membership, revoke two sessions and old invitations, deny the old sessions and
  disappear from the authenticated roster. Rejected payloads preserve all state.
  Its child server disables sending and is stopped before the test database is
  dropped. No preexisting development membership is removed: a before/after
  fingerprint confirmed all 16 memberships observed at this run were unchanged.
  Browser confirmation itself remains distinct from this real-HTTP verification.

## Next milestone

Completed organizer invitation/removal work and the runtime DELETE fix were
committed and pushed to dev as
[1f73bbe](https://github.com/Aadi012/Shaadi-Pilot/commit/1f73bbea5d731cd60f1176ed8d95977de5d83f56)
on 28 October. Local HEAD and remote refs/heads/dev were verified identical.
The independent .env.example edit was excluded; configured secrets were absent
from the staged text scan. No deployment was performed.

### 10. Functions/events — 28 October 2026

Status: In progress — first implementation and automated verification; visual
review and production-readiness follow-ups remain.

- User authorized this slice and selected blocking removal when linked records
  exist. The [implementation plan](functions-plan.md) records scope and sequence.
- Stitch lists desktop schedule, detail and form screens plus mobile management.
  Metadata is accessible, but asset downloads return 401; fresh URLs and the
  documented configured fallback did not retrieve approved exports. No visual
  inspection or frontend implementation is claimed.
- The user subsequently supplied five screenshots (three desktop and two mobile
  captures). These were inspected from the attachments and archived in
  docs/designs/functions. Screenshot access resolves the visual-reference blocker.
- Implemented events module, GET/POST/PATCH/DELETE REST routes, Functions workspace,
  details and create/edit drawer, manual venues, description, explicit timezone
  conversion and version-checked updates. Both roles manage functions; writes
  derive trusted membership and validate the stale-wedding guard. DST ambiguous
  and nonexistent local times are rejected rather than guessed.
- Linked-record removal is blocked; unlinked functions are archived. Shared
  wedding write serializes mutation; future reference writers must participate
  in this lock convention. Existing records are never cascade-deleted.
- Added bounded cursor lists, schedule index setup and real upcoming overview
  summaries. The additive development index was applied without changing records.
- Automated evidence: 67 unit/render tests, 72 isolated integration tests and
  seven running-Next HTTP tests passed. The latter includes function create/edit,
  stale deletion and successful empty-DELETE removal. Production build passed.
- Remaining review: desktop/mobile browser walkthrough, exact design fidelity,
  durable POST idempotency after lost responses, richer per-field errors and
  exhaustive event concurrency/pagination coverage. Drafts remain memory-only;
  cancellation asks before discarding. Publication and related module panels are
  deferred. No real wedding records were created and no commit/push/deploy was
  performed for Functions. Do not mark this slice complete before follow-ups.

- Form corrections (28 October): manual testing found populated dates failed to
  save and canceled forms reopened with discarded values. Pending disabled the
  fieldset before FormData was read, omitting all disabled controls. The client
  now captures/validates the draft synchronously before pending or session fetch.
  Closing the dialog resets/remounts the form, and each open begins a new form
  generation. Confirmed Cancel/Escape and successful save discard old input;
  validation/network/conflict failures keep the open draft intact.
- Correction checks: 71 unit/render tests and production build pass. Four new
  draft tests cover populated overnight dates, snapshot independence and unchanged
  inputs on validation failure. No persistence logic changed; previous 72 MongoDB
  and seven HTTP test results remain historical evidence, not rerun for this UI fix.
  Browser verification was attempted but local browser use is disabled in Work
  settings. Manual save/cancel/reopen/success-reopen verification remains pending;
  no existing wedding records or memberships were modified.

- Dashboard assertion follow-up (28 October): both exact wedding-overview count
  assertions now include upcoming: [], matching fixtures without active upcoming
  functions. No production behavior changed. The full isolated integration suite
  passes all 72 tests; npm run check passes all 71 unit/render tests plus format,
  lint and types. Production build passes after removing only the verified
  generated .next/server output affected by a Windows/OneDrive EPERM cleanup error.
  Tasks is proposed next in [the scoped plan](tasks-plan.md); no Tasks code has
  been implemented. Functions review/retry limitations above remain open.

- Commit handoff (28 October): user authorized committing and pushing this slice
  to dev. Fresh npm run check passes formatting, lint, types and all 71 unit/render
  tests. The isolated integration rerun passes all 72 tests, and the running-Next
  HTTP regression suite passes all seven tests. Initial integration execution
  stalled and was stopped; the network-enabled rerun passed. Production build
  passes after scoped cleanup of generated .next/node_modules and .next/server
  output affected by Windows/OneDrive permission/directory cleanup errors.
  The independent .env.example edit is excluded. Browser verification and durable
  create-retry work remain open; this is not a production-readiness signoff.
- Tasks remains planned, not implemented. The user approved date/time deadlines
  in the wedding timezone and preserving removed-Manager assignments with a
  “Former organizer — reassign” label. These approvals are recorded in
  architecture-decisions.md and tasks-plan.md.

Implement Functions as the first planning module and populate its overview panel
after review of Manager removal. Continue with
Tasks, Guests, private invitations/RSVP and the remaining [V1 roadmap](roadmap.md).
Resolve affected open decisions before each feature. The existing dashboard is
partial and will gain real summaries incrementally. General-recipient email and
live recovery verification remain release work.

### 11. Tasks management — 28 October 2026

Status: In progress — implemented for user review; broader browser coverage and
final approval remain.

- User authorized the approved Tasks plan after the Functions handoff commit
  [60d0a41](https://github.com/Aadi012/Shaadi-Pilot/commit/60d0a41d6cc548f328b3ffb6ca845eab059e3229).
- Retrieved and inspected all four Tasks Stitch references (desktop registry,
  detail, edit/conflict/remove and mobile). Sanitized references and original
  decoded HTML/PNG exports are under docs/designs/tasks. No new designs generated.
- Implemented Tasks REST services and responsive workspace forms with statuses,
  optional assignee/function/deadline, cursor filters, version checks, archive,
  same-wedding reference checks and retained former assignments. Dashboard and
  function summaries are connected. No production-readiness signoff is claimed.
- Added durable transactional create receipts for Functions and Tasks. Clients
  retain the same key/payload after an uncertain response. Drafts stay memory-only.
  External notifications, attachments, PDF export and offline sync remain excluded.
- No commit, push or deployment is authorized for this new implementation yet.
- Verification so far: npm run check passed formatting, lint, types and 76
  unit/render tests; isolated MongoDB tests passed 80 cases; running-Next HTTP
  tests passed eight cases; production build passed with database/email
  credentials blank for that process. Final checks follow review corrections.
- Browser confirmed Tasks Cancel/reopen clears the draft (the user cleared a
  stalled native confirmation), save failure preserves populated fields, populated
  deadlines save/display correctly, completion persists and updates summaries,
  and success/reopen starts blank. Observed desktop/mobile CSS widths of 1200px
  and 325px showed no page-level horizontal overflow. Browser zoom affected
  requested viewport dimensions; exact 1440px/390px rendering is not claimed.
- The long-running dev server initially returned unexpected API errors. A scoped
  restart resolved observed GET/POST failures; the precise hot-reload cause was
  not isolated. It remains running at http://localhost:3000. A subsequent browser
  function create saved populated overnight dates and its next form opened blank.
  Durable function retries cover concurrent replay and retry after archival.
- Removed only this browser run's uniquely named QA task/function and their
  receipts after verifying tenant and UTC times. A fingerprint confirmed other
  checked users and wedding planning records were unchanged. The preexisting QA
  function and real invitation-test membership were retained. Additive Tasks
  indexes were applied in development without modifying existing records.
- An initial unit run hit Windows worker-start timeouts; a two-worker rerun and
  later full check passed. An initial permission review timed out before database
  test startup; retry passed. An HTTP assertion was corrected from 400 to the
  existing 422 response for an unknown schema field; runtime validation was correct.
- Unassigned summaries count incomplete tasks, matching “Ready to delegate”.
  Archived task history still blocks function removal. Remaining review includes
  both-role browser journeys, keyboard/edit-discard/mobile dialog coverage and
  exact design fidelity. Drafts are memory-only; reload/restart can lose input.
- Final rerun after corrections: npm run check (76 tests), the full isolated
  integration suite (80 tests), the built-server HTTP suite (eight tests) and
  npm run build all pass. Changed-file whitespace checks pass, excluding the
  untouched independent .env.example edit. Browser use was disabled in Work
  settings during the final viewport-reset/navigation attempt; do not claim that
  last navigation or reset completed. The earlier observed browser checks stand.
- User accepted this implementation and authorized commit/push on 28 October.
  Delivered scope is accepted; the broader release/browser review above remains
  outstanding and is not implied complete by the approval.

### 12. Guest records and function selection — 28 October 2026

Status: In progress — implemented for review; browser walkthrough pending.

- Tasks and Functions retry fixes were committed and pushed to dev as
  [9e96204](https://github.com/Aadi012/Shaadi-Pilot/commit/9e9620493c7b4e49d06719cdc05efb5f703e4eaf).
  Local and remote heads matched. The independent .env.example edit was excluded.
- User approved required email and shared-address duplicate warnings without
  merging. The [Guest slice plan](guests-plan.md) separates contact selection from
  future private invitations/RSVP and records authorization/verification scope.
- Retrieved and inspected four existing approved Stitch references: desktop
  registry, detail, add/edit policy variants and mobile directory. Original decoded
  HTML/PNG and sanitized manifest are in docs/designs/guests. The exported form
  screenshot is partially clipped; its source HTML was available as reference.
  Generated transport/room/seating, verification and RSVP claims are excluded.
- Added tenant-scoped guest contact CRUD, required normalized email, optional
  phone/notes, shared-email warnings, selected functions, literal name/email search,
  paged filters, safe create retries, versioned updates/archive and dashboard counts.
  Admin and Manager share planning access. Selection is explicitly planning intent:
  no invitation, email delivery, private link or RSVP record is created here.
- Transactions share the wedding lock with function archival and membership
  changes. Existing invitation/gallery references block identity/selection edits
  and archive until a revocation workflow is implemented. Archived contact
  selections retain references and still block function removal; no cascade cleanup.
- Isolated integration suite passes 86 tests including duplicates, foreign tenants,
  stale writes, concurrent create replay, cursor tenant/filter binding, access
  safeguards and selection/function-removal races. Real running-Next HTTP suite
  passes nine tests including Manager contact writes and authenticated page rendering.
  Production build passes with external-service credentials disabled for that process.
- Initial checks caught a React ref read in confirmation copy, fixed before rerun.
  A shared-email HTTP search assertion was corrected to expect both contacts;
  the search correctly matches email as well as name. A new text-escaping render
  test needed the same router mock as existing component tests; corrected in tests.
- Additive Guest indexes were applied in development; no existing records removed
  or modified. Automated writes used isolated disposable test databases only.
  No Guest test email was sent, no dependencies installed, no commit/push/deploy
  performed for this new slice. The separate .env.example edit remains untouched.
- Browser verification was attempted but local browser use is disabled in Work
  settings. Desktop/mobile form submissions, cancel/Escape/reopen, conflict reload
  and visual/accessibility walkthroughs remain unverified. Memory-only drafts stay
  on validation/network/conflict failure and reset on confirmed discard/success;
  automated helper/render tests do not substitute for real browser completion.
- Final project checks pass: formatting, lint, types and all 81 unit/render tests.
  The text-escaping render test also dropped an invalid expectation that a closed,
  unopened form was mounted. The 86 integration tests, nine built-server HTTP
  tests and final production build pass. Changed-file whitespace checks pass,
  excluding the untouched independent .env.example edit. Guest code remains local
  for review; the earlier Tasks commit is the latest verified remote change.

- Guest UX corrections — 29 October: Reset now clears controlled search/function
  inputs together with the applied query and pagination. Cancel/Escape compares
  raw fields and checked functions against the initial contact, closing unchanged
  or fully reverted drafts directly. Changed drafts and uncertain create attempts
  retain explicit discard confirmation. Escape from that confirmation returns to
  the draft first, avoiding FormData reads while its controls are disabled.
- Save transport errors now explain the connection problem, how to retry and that
  the draft is retained. Unreadable save responses explain safe same-payload retry;
  API validation/conflict guidance is preserved. Neither the draft nor the create
  key is reset on failure. Focused tests cover raw/invalid/reverted field changes,
  function-selection ordering, transport rejection, unreadable responses and API
  conflict messages. npm run check passes all 83 unit/render tests plus formatting,
  lint and types; final production build passes with service credentials blank.
  No persistence/API behavior changed, so the prior 86 integration and nine HTTP
  results above remain historical evidence, not rerun for these client-only fixes.
- Browser testing was requested again. The user reported enabling access, but a
  fresh browser inventory still returned “Local browser use is disabled in Work
  settings”. No interactive verification of these fixes is claimed; no alternate
  automation bypass or settings change was attempted. No commit/push/deploy.

Guest retry/pagination corrections — 29 October:

- Definitive first-attempt create rejections clear only the client attempt/key,
  allowing corrections to the preserved contact draft (including deselecting a
  removed function). Typed API errors distinguish known rejection statuses/codes
  from transport failures, unreadable responses, server errors, key conflicts and
  archived-original conflicts. Those uncertain outcomes keep retry protection.
  An earlier uncertain POST stays protected even if a subsequent request rejects;
  preflight failures before dispatch do not lock a fresh draft unnecessarily.
- Applied query, rows, summary and cursor now commit as one successful listing
  state. Failed Apply/Reset retains the previous listing and cursor/query pairing;
  visible filter inputs remain editable separately. Stale responses stay ignored.
- Focused regressions cover rejected-create correction, unchanged-key retry,
  earlier uncertainty followed by rejection, multiple loaded pages during a failed
  filter replacement, cursor/query mismatch prevention and successful replacement.
  npm run check passes 85 unit/render tests, formatting, lint and types. Production
  build passes with service credentials blank for that process. Changed-file
  whitespace checks pass excluding the independent .env.example edit. No API or
  database behavior changed; prior integration/HTTP results were not rerun.
  Interactive browser verification is not claimed. No commit/push/deploy.

## Keeping this record current

- Read this file before starting a major feature. Add an entry when major work
  starts and update it in the same change as the implementation, before handoff.
- Use `Not started`, `In progress`, `Blocked` or `Complete`, with a brief scope
  qualifier when needed, such as `Complete — UI preview`.
- For each milestone, record the date, delivered behavior, actual verification
  results, limitations and remaining work. Include commit or PR references when
  available; never invent a reference or mark unfinished work complete.
- Preserve completed milestone history. Update existing entries for material
  follow-up work rather than recording every small edit as a new feature.
- Keep credentials, private guest links and personal guest data out of this file.
- Keep approvals and architectural conflicts in the decision record and link to
  them here. Maintaining status does not authorize commits, pushes or deployments.
