# ShaadiPilot project status

Last updated: 25 October 2026 (Asia/Kolkata).

This is the implementation progress record. The [PRD](prd.md) defines product
scope; [architecture decisions](architecture-decisions.md) record accepted
contracts and unresolved choices. A status entry does not approve new scope or
resolve an open product decision.

## Current position

The application foundation and public marketing homepage are complete for their
approved scope. Organizer registration and MongoDB-backed login/session/logout
are complete for the core authentication slice. New and duplicate signup attempts
receive the same generic response without automatic sign-in; users continue to
login. Valid signed-in visitors to login/signup redirect to `/account`.
The user confirmed manual testing and code review are complete and approved this
work for commit and push on 25 October 2026. Latest automated verification passed:
34 unit/render tests, 12 isolated MongoDB integration tests, formatting, lint,
type checking and the production build.
Wedding onboarding, tenant-owned
planning features and external provider integrations remain unimplemented.
No production deployment is recorded.

## Milestone history

| Completed       | Milestone                                   | Status                | Commit                                                                                             |
| --------------- | ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| 24 October 2026 | Project scaffold and engineering foundation | Complete              | [21f0dd6](https://github.com/Aadi012/Shaadi-Pilot/commit/21f0dd6372aeef4ee39c71a0337e402c89f00410) |
| 25 October 2026 | Public marketing homepage                   | Complete — UI preview | [13beba3](https://github.com/Aadi012/Shaadi-Pilot/commit/13beba33431a5ece8136ecc9b996cd22c48bd323) |
| 25 October 2026 | Organizer login and signup                  | Complete — UI preview | Included in this change                                                                            |
| 25 October 2026 | MongoDB-backed organizer authentication     | Complete — core auth  | Included in this change                                                                            |

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

## Next milestone

Plan password recovery as the smallest next feature; implementation is not started
and requires its own approval. Complete recovery before public onboarding.
Wedding creation/joining follows its own affected
[feature contracts](architecture-decisions.md#feature-approval-gates). This entry
does not authorize those later features or a production release.

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
