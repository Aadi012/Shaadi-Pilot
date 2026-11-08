# Owner setup checklist — 8 November 2026

Local configuration presence was checked without printing values: R2's four
settings and Google's three settings were empty. Resend, CRON_SECRET and token
encryption settings were present. Presence does not prove validity or confirm
Vercel's settings. Do not paste credentials into chat or commit .env.local.

## 1. Cloudflare R2: configure and verify organizer gallery

1. Open Cloudflare R2, enable it if necessary and create a private bucket for
   development/testing. Use a separate production bucket when ready. The current
   client uses the default account R2 S3 endpoint, not a jurisdiction override.
2. Leave public bucket access, r2.dev access and public custom domains disabled.
3. Create an R2 S3 API token with Object Read & Write access scoped to this bucket.
   Privately retain the Access Key ID and Secret Access Key. The app needs upload,
   read and deletion capabilities; it does not need bucket administration.
4. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to ignored
   .env.local. Use the actual bucket name, not an endpoint URL. Add the appropriate
   production values to Vercel Production when ready; do not reuse the test bucket.
5. Set bucket CORS. For a shared pilot bucket the following exact origins work;
   for separate buckets keep only the origins that use each bucket:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://shaadi-pilot.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Browser Content-Length is automatic. Browser uploads use signed PUT; deletion is
server-side, so CORS does not need browser DELETE. Add any actual custom/preview
origin explicitly when needed. Do not use wildcard origins.

6. Tell the developer the private settings are ready. The developer will verify
   required gallery indexes (npm run db:gallery:indexes), then test a disposable
   photo: upload, sanitized private preview, expiry, removal and cleanup. Index
   application to a new database/environment needs approval; it is not a migration.

R2 setup unlocks real organizer gallery verification. Guest gallery and personal
QR still require implementation; credentials alone do not deliver those features.
Detailed guide: [gallery setup](gallery-setup.md).

## 2. Google Places: enable discovery

1. Create/select a Google Cloud project, link billing and enable Places API (New).
2. Create a server-only API key and restrict its API access to Places API (New).
   Set appropriate provider quotas and billing alerts. Do not use browser-referrer
   restrictions for this server-side integration; assess server restrictions for
   the actual hosting network before applying them.
3. Add GOOGLE_PLACES_API_KEY privately to .env.local and the intended Vercel
   environment. No NEXT_PUBLIC version is needed.
4. Approve and publish real, publicly accessible Terms of Use and Privacy Policy
   that meet Google's requirements. Supply their HTTPS addresses as
   GOOGLE_MAPS_TERMS_URL and GOOGLE_MAPS_PRIVACY_URL. Do not use nonexistent links
   or placeholder policies. The developer can prepare the pages for owner review.
5. Tell the developer to run a small live search/save/details test. No need to
   repeat local duplicate-index setup: it was already applied with approval.
   Other databases need npm run db:vendors:indexes after approval.

Detailed storage/attribution contract: [Places setup](places-setup.md). This
implementation saves Place IDs and organizer labels/notes, not Google snapshots.

## 3. Resend: confirm sender readiness

The API key and sender setting exist locally; one Manager invitation was received
and accepted earlier. If still using onboarding@resend.dev, finish an owned sender
domain before general customer sending. Add the domain in Resend, publish its
requested DNS records, wait for verification, then configure RESEND_FROM_EMAIL
with the verified sender. Keep RESEND_API_KEY private. Confirm production settings
separately. The developer will verify password recovery, guest invitations and
reminders to approved test recipients; do not recreate existing accounts.

## 4. Production environment and scheduled processing

Local .env.local is not loaded by Vercel. Verify environment selection and keep
APP_BASE_URL=https://shaadi-pilot.vercel.app for the current production domain.
Local development remains http://localhost:3000 with npm run dev. Keep existing
MongoDB, token encryption and cron secrets stable; do not regenerate keys merely
to configure R2/Google, as active encrypted invitations depend on them.

Choose a production scheduler/cadence supported by your Vercel plan. Coordinate
with the developer to configure:

- GET /api/internal/cron/emails — durable email queue processing.
- GET /api/internal/cron/photos — abandoned uploads and removal cleanup.

Both require Authorization: Bearer CRON_SECRET. The app expects a private random
secret of at least 32 characters. Vercel Cron can send it automatically from the
production deployment environment. The endpoints exist; scheduled invocation is
not configured in the repository. Confirm successful scheduled runs after an
authorized deployment. Do not send secrets in URLs or expose them in screenshots.

## Division of remaining work

Owner: account/billing setup, private credentials, bucket CORS, domain DNS,
policy approval/publication, plan/cost choices and production environment values.
Developer: final code verification, safe index checks, live integration smoke
tests, browser/mobile tests, scheduler configuration after approval and remaining
V1 implementation. External setup should be completed one service at a time.

## Official references

- [R2 credentials and bucket scoping](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Places API setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Resend domains](https://resend.com/docs/dashboard/domains/introduction)
- [Vercel cron management](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)
