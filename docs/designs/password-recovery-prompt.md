# Password recovery design brief

Prepared and approved 26 October 2026. Finalized design project:
https://stitch.withgoogle.com/projects/14249455352497050706. This preserved brief
records the design request; implementation and actual verification are tracked
in project status and password-recovery setup.

Paste the following into the existing ShaadiPilot Stitch project:

```text
Design the organizer password recovery flow for ShaadiPilot, a collaborative
Indian wedding-planning application. Add these screens to this existing project.
Use the approved Login and Signup screens as the primary visual reference.
Preserve the exact ShaadiPilot logo, Newsreader headings, Manrope body/controls,
plum primary actions, lavender canvas, warm neutral surfaces and restrained brass
accents. Reuse the existing authentication-page layout and imagery where useful.
These are public authentication pages, without the organizer dashboard sidebar.

Produce desktop (1440px) and mobile (390px) layouts for the three screens below.
Layouts must also work at 320px without horizontal scrolling. Use descriptive
screen names beginning with "ShaadiPilot — Password recovery".

1. Forgot password (/forgot-password)
Heading: "Forgot your password?"
Supporting text: "Enter your email address to request a password reset link."
One labelled email-address field, one primary "Send reset link" button, and a
"Back to log in" link. Do not ask for wedding details or the current password.
Design default, invalid/empty email, submitting and temporary service-error states.
Preserve the entered email after errors. A failure must not identify whether the
account exists. Include clear rate-limit feedback when requests are throttled.

2. Request confirmation (same route after an accepted request)
Heading: "Check your email"
Use exactly this account-safe message:
"If an account exists for that email, we'll send a password reset link."
Supporting guidance: "Check your spam folder. The link will expire after
30 minutes. If it expires, request a new link."
Include "Back to log in" and a secondary "Try another email" action returning
to the request form. Do not claim an email was sent, delivered or received.
Do not display account names, wedding details or an account-existence result.
Do not add an inbox-provider shortcut, OTP field or automatic resend countdown.

3. Reset password (/reset-password, entered from the email link)
Heading: "Choose a new password"
New password and Confirm new password fields, each with a labelled accessible
show/hide control. Help text: "Use at least 15 characters. Spaces are welcome."
Maximum length is 128 characters. Primary action: "Reset password".
Never display the recovery token, email-link secret or an account identifier.
Design empty, validation errors, password mismatch, submitting and temporary
failure states. Do not show success until the server confirms completion.

Also design these reset-page outcomes:
- Invalid, expired or already-used link: use one neutral message,
  "This reset link is invalid or has expired. Request a new one."
  Primary action "Request a new link", secondary "Back to log in".
- Successful reset: "Your password has been updated. Sign in with your new
  password. Your previous sessions have been signed out."
  Primary action "Back to log in". No automatic sign-in or dashboard redirect.
  Password fields must no longer be visible in the success state.

Interaction and accessibility:
- One primary action per state; visible focus, proper labels, inline errors and
  status messages that can be announced by screen readers.
- Disable repeat submission while pending; keep layouts stable when errors appear.
- Mobile inputs at least 16px, touch targets at least 44px, sufficient contrast.
- Respect reduced motion. Avoid decorative animation and excessive illustrations.
- Show state variants separately in Stitch; do not add a state switcher or debug
  inspector to the product UI.

Scope exclusions: no email verification, social login, SMS, OTP, security
questions, account registration, organizer invitations, account deletion,
membership changes, billing, promotional claims or new product modules.

Also provide a simple responsive transactional reset-email reference:
ShaadiPilot logo/name, "Reset your password" heading, one "Reset password"
button, 30-minute expiry guidance, and "If you didn't request this, you can
ignore this email. Your password has not changed." Use a fictitious placeholder
destination, not a real token. No marketing, recipient wedding details, tracking
widgets or account-existence claims on public pages.
```

## Engineering plan after design review

- Use the API document's request/confirm routes under `/api/v1/auth`; the system
  design's older forgot-password/reset-password API names are not aliases.
- Proposed token lifetime: 30 minutes, with cryptographic random secrets and
  hash-based validation. Enforce expiry in code independently of TTL cleanup.
- Reset and invalidation of all prior reset tokens/sessions must commit together.
  Concurrent redemption may succeed only once. Do not automatically authenticate.
- Preserve account-safe request responses. Apply shared MongoDB-backed limits,
  strict validation and origin/CSRF protections without requiring an active login.
- Send only to the account's stored email and use the configured trusted app URL,
  never a caller-supplied destination or Host header.
- Use MongoDB-backed durable delivery with immutable provider request identity,
  bounded leases/retries and an injectable Resend adapter. Never log reset links,
  raw tokens or provider response bodies. External sends stay outside transactions.
- Define secure short-lived delivery material separately from the token hash:
  a hash alone cannot reconstruct a link for asynchronous email. Finalize that
  storage/cleanup contract before implementing the outbox; do not store raw links
  in plaintext work records.
- Do not configure external services, send real emails, deploy or add production
  Cron jobs merely to prepare the feature. Configure local server-only secrets
  outside chat when ready; use mocked delivery for automated verification first.
- Confirm actual sender configuration, link expiry, retry behavior and the batch
  invocation cadence before claiming end-to-end recovery is complete.

No new authentication framework, Redis, queue service or backend server is needed.
