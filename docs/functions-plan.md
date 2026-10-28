# Functions/events — implementation slice

Started 28 October 2026 after the user authorized the next feature.

## Scope and sequence

1. Inspect approved desktop list, detail, create/edit/remove and mobile designs.
2. Add the events module with tenant-scoped persistence, explicit schedule index,
   validated UTC start/end instants and an IANA display timezone. New functions
   default to the wedding timezone; later wedding timezone edits never reschedule
   existing functions. Include the PRD description field missing from the source
   API's POST field summary; document this additive reconciliation.
3. Implement authenticated `/api/v1/events` GET/POST and
   `/api/v1/events/{eventId}` GET/PATCH/DELETE. Both roles manage functions. Use
   trusted server membership, strict schemas, Origin/CSRF, stale-wedding guards,
   cursor ordering by startsAt then ID, and version preconditions for edits/removal.
4. Wire approved responsive list, detail, form, confirmation, empty/error/pending
   and conflict states. Use manually entered venues; do not add Google Places or
   guest-invitation controls in this slice. Public website publishing is later.
5. Populate upcoming functions in the existing overview from active wedding data.
6. Verify authorization, tenancy, chronology/timezones, stale updates, concurrent
   changes, deletion safeguards and actual Next.js HTTP transport. Run project
   checks/build and browser checks before marking complete.

## Removal decision

The user explicitly selected **block removal when linked records exist** on
28 October. Return a conflict without changing the function or its references.
Check all relevant wedding-scoped task, expense, invitation, vendor and photo
references according to their persisted contracts. Archive unreferenced functions
rather than physically deleting history. Future modules must use a shared
transactional locking convention so a reference cannot appear concurrently with
archival. Never cascade-delete planning records or silently change eligibility.

## Design discovery and current limitation

Stitch listed these screens in project 7444919587454097178:

| Screen                         | ID                               | Device  |
| ------------------------------ | -------------------------------- | ------- |
| Functions List & Schedule      | a2a8dd6321f440839c21c1320775bc5f | Desktop |
| Function Detail Hub            | 668710f687104e20aee134910b5efd95 | Desktop |
| Create, Edit & Remove Function | a82b26266fcb429e94d61da111169420 | Desktop |
| Functions Management           | 5549406f35fc4aabb80138b0ac4f6919 | Mobile  |

Metadata retrieval succeeded. Asset downloads returned HTTP 401, including fresh
get_screen URLs; the configured read-only fallback also failed. No function image
or HTML was successfully retrieved or visually inspected. Do not claim these
designs have been implemented or substitute an invented visual reference.
Restored export access or user-supplied approved exports is needed for design review.

## Implementation update

The user later supplied five approved screenshots, inspected in the conversation
and archived as list-desktop.png, detail-desktop.png, form-desktop.png,
mobile-top.png and mobile-bottom.png under docs/designs/functions. Initial event
APIs, persistence, workspace list/detail/form and overview summaries are implemented.
See project status for actual checks and remaining work; the slice is not yet
marked complete. The historical export failures above do not block screenshot use.
