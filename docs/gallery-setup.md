# Private organizer gallery setup

The current implementation was verified using mocked R2 storage. It is not a
local fake-storage product mode. Without valid R2 settings, the gallery can show
metadata/setup state but upload/view calls fail closed.

Privately configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
R2_BUCKET in ignored .env.local and the appropriate Vercel environment. Scope the
R2 API token to the private bucket and required object read/write/delete rights.
Keep public bucket access and custom public domains disabled. Never expose keys
through NEXT_PUBLIC variables or commit real values.

Bucket CORS must allow the exact application origins, PUT and GET, and the
Content-Type request header. Browser Content-Length is set automatically and
bound into upload signatures. Review exact CORS/header behavior with real R2
before enabling guest uploads. Allow only needed origins, not a wildcard.

Run npm run db:gallery:indexes against the intended database. Restart local app or
redeploy Vercel after configuring variables. Optional GALLERY_MAX_PHOTOS and
GALLERY_MAX_BYTES default to 1000 and 5368709120 respectively.

Configure an authorized scheduler to call GET /api/internal/cron/photos with
Authorization: Bearer CRON_SECRET; choose an appropriate bounded cadence for your
plan. This is required to free reservations and delete staging/removed objects.
The route handles at most ten records per call. No automatic scheduler is installed
by this change. Monitor retry backlog without logging keys or signed URLs.

Before production: verify direct browser uploads, MIME/size signature rejection,
byte decoding, metadata stripping, signed-view expiry, removal and cleanup using
a disposable photo in a test bucket. Test mobile and desktop CORS and 20 MiB
boundaries. Credentials, real storage, deployment and live photo traffic have not
been verified by the mocked tests. Guest gallery access and QR are not implemented.

References: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/),
[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/),
[Sharp output and metadata](https://sharp.pixelplumbing.com/api-output/).
