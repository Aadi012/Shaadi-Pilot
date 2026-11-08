# Google vendor discovery — 4 November 2026

Implemented with mocked Google verification first, as requested. The runtime
never returns fake listings. Manual saved contacts continue working without
Google configuration; discovery fails closed with an actionable setup state.

## Private setup

Use an enabled Places API (New) project with billing, API-key restrictions and
provider quotas. Configure GOOGLE_PLACES_API_KEY server-side in the appropriate
environment. Do not use NEXT_PUBLIC or commit the value. Vercel environment
configuration must be followed by an authorized redeployment.

The application owner must approve and publish publicly accessible Terms of Use
and Privacy Policy incorporating Google's required references. Supply their
HTTPS addresses as GOOGLE_MAPS_TERMS_URL and GOOGLE_MAPS_PRIVACY_URL. This
increment does not invent or publish legal policies on the owner's behalf.
All three settings are required before live provider calls are enabled.

Apply npm run db:vendors:indexes after environment approval. It preserves the two
manual indexes and adds a partial unique (weddingId, googlePlaceId) index for
active string Place IDs. Archived entries remain, and a later new save may create
a new active reference. Existing manual contacts are excluded from the index.

## Implementation contract

GET /api/v1/vendors/discover accepts category and locationSource. Sources are
wedding (server's stored location), function (same-wedding eventId), and custom
(explicit area text). It requires authenticated membership and the original
X-Wedding-Context header. Query validation rejects mismatched source fields.

Current wedding/function contracts store text locations, unlike the API source's
latitude/longitude/radius example. Use Places Text Search (New) with the explicit
location text instead of silently guessing coordinates or IP-based proximity.
The UI makes no exact-radius or distance promises. Return at most ten matches
in Google's order; additional result pages and automatic location detection are
outside this increment. Recheck membership after every provider call.

POST /api/v1/vendors/from-google accepts Place ID, organizer-written label,
category and notes. Validate the Place ID with an ID-only request before saving;
keep provider calls outside transactions. A wedding write lock and partial unique
index protect concurrent saves. Duplicate saves preserve the original label/notes.
Durable scoped UUID receipts support retries through provider outages and reject
changed request bodies or retries of removed originals.

Persist only Place ID and organizer-entered data. No provider result cache,
listing snapshots, ratings, images, contacts or addresses are copied into MongoDB.
Google source cards identify the organizer's label and have an explicit Load
Google details action. GET /api/v1/vendors/{vendorId}/google loads fresh listing
data only for the current wedding and rechecks removal/membership before return.
Provider DTOs remain in component memory; no localStorage, shared cache or logs.

Provider requests use fixed Google endpoints, no redirects, an eight-second
timeout and explicit field masks. Search requests name/address/rating/maps/
attribution only; details additionally request available phone/website. Client
requests retain the vendor module's deadlines. Quotas: 10 per organizer, 50 per
wedding and 500 globally per 15-minute bucket, including explicit details and
first-save ID verification. No automatic retries or calls on page load.

Display compact Google Maps attribution with translate=no in the same visually
separated container as provider content, including returned third-party credits.
Only safe HTTP(S) contact/attribution links are serialized. Map actions use a
Google domain or a deterministic Place-ID URL. No review text, photos, AI
summaries, verification badges, cached/offline claims or bookings are introduced.

## Source policy references

- [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Place ID storage exception](https://developers.google.com/maps/documentation/places/web-service/place-id)

These restrictions take precedence over the source architecture's generic brief
search-cache suggestion and saved-snapshot wording. Raw Google payloads and API
keys never enter logs. Live billing, key restrictions, public policy availability
and Google delivery remain unverified until owner setup and live smoke testing.
