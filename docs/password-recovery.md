# Password recovery setup and verification

The implementation uses the approved custom auth, Atlas transactions, MongoDB
delivery records and Resend. There is no new dependency or separate worker.

## Local configuration

Next.js loads `.env.local`; it does not load `.env.example`. Keep real values in
the ignored local file and environment-scoped deployment secrets. Never paste
them into chat, source files, screenshots or command arguments.

Required for requests/dispatch:

- `RESEND_API_KEY`: a Resend sending key for the intended environment.
- `RESEND_FROM_EMAIL`: sender email or `ShaadiPilot <sender@your-domain>` with
  an authorized sender domain. `EMAIL_FROM` is a fallback name only.
- `TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hex digits or standard
  padded base64 (44 characters). Do not reuse an API key or human password.
- `TOKEN_ENCRYPTION_KEY_ID`: a short nonsecret identifier for that key.
- `APP_BASE_URL`: trusted app origin; local default is http://localhost:3000.
  Use the same hostname when opening email links locally, and HTTPS in production.
- `CRON_SECRET`: random server-only secret, at least 32 characters, for retry drain.

Missing local encryption/cron secrets were generated privately during development.
The effective Resend key and sender remained empty at verification; the user chose
mocked delivery tests and will configure Resend later. No live message was sent.
Do not mistake a populated variable name or example assignment for usable settings.

Run `npm run db:auth:indexes` and `npm run db:recovery:indexes` once per environment.
Both scripts are additive. Recovery setup was applied to the configured development
database; tests use separate generated databases and remove only those databases.
Restart the development server after changing environment values.

## Delivery invocation

An accepted request commits its token and encrypted mail work together. Next.js
`after` attempts that one message after the response. If the invocation fails,
durable work remains eligible after its lease expires. The internal GET
`/api/internal/cron/emails` requires `Authorization: Bearer <CRON_SECRET>` and drains
at most five due reset messages. Do not put the secret in the URL.

No Vercel schedule or external service configuration is created by this change.
Before launch, configure a protected frequent invocation compatible with the
30-minute expiry, monitor failed/quarantined work and test actual email-client
fragment preservation. Provider acceptance is not proof of inbox delivery.

Each reset has its own immutable one-message Resend batch. Retries retain the
same payload and idempotency key. Ciphertext is cleared on terminal processing
and expires with the reset link; seven-day delivery audit metadata remains.
Keep the current encryption key until pending work has drained or expired.
Replacing it immediately makes older payloads unreadable; no keyring is included.

## Verification and limits

`npm run check` covers contracts, hydration safety, configuration, encryption,
provider response classification and existing regression tests.
`npm run test:integration` verifies the real Atlas transaction/index behavior
using generated isolated databases, synthetic accounts and injected mock senders.
It never sends email. Cases include single-use/concurrent redemption, rollback,
session revocation, account-safe responses, throttling, expiry, stale leases,
identical retry identity, exhausted attempts and ciphertext removal.

Browser verification covers the real request/reset layouts, login navigation,
required validation, safe missing-service feedback, valid/invalid landing links,
fragment removal, reopening a link in the same tab and widths 320px/390px.
The browser's password-change submission is left for the user; actual reset
success, old-password denial and session revocation are integration-test evidence.
Recovery confirmation/success rendering and inbox delivery are not claimed as
manually completed browser tests. A real email round trip, sender setup, deployment
secrets, scheduler configuration and production monitoring remain release work.
