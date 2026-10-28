# Approved Stitch references

Project: https://stitch.withgoogle.com/projects/7444919587454097178

27 October: the exposed Stitch screen-list tool worked and listed 56 screens.
For the Manager invitation slice, three desktop screens were retrieved and
visually inspected: Team Management (`c05aa33afb0841d0aa6603ce8b678a46`), Invite &
Revoke Dialogs (`9f29205880f148aabd851a335d1318b5`) and Invitation Acceptance &
States (`116cd362637f4b32a781cb01ae0c6076`). Original HTML/PNG exports and a sanitized
manifest are under `organizer-invitations`. No dedicated mobile Team screen was
listed; mobile adapts the existing responsive shell. Listing other screens is not
proof of inspection. Unsupported generated role/removal/copy-link controls were
excluded. The existing export helper does not refresh these three new exports.

The user approved the welcome, wedding details and overview designs on
25 October 2026. Eight desktop/mobile reference screens are archived under
`wedding-workspace`, with screen names/IDs in `references.json`. The populated
variants guide future planning-module work; the current slice implements creation
and an empty overview. Exported HTML is reference material only: never execute its
scripts, import its CDN dependencies or ship its state inspector controls.

## Connection checks and fallback

Password recovery project:
https://stitch.withgoogle.com/projects/14249455352497050706

Four approved recovery screens were retrieved and visually inspected on
26 October: forgot password, reset password, confirmation/statuses (desktop) and
a mobile flow. Originals and a sanitized manifest are in `password-recovery`.
The exposed Stitch listing worked this time; local exports used the existing
read-only helper logic with the supplied project ID. No transactional-email screen
was found or claimed inspected. Generated state toggles, passkey content and
encryption claims are excluded. The existing design:check export command still
targets the original workspace project; it does not refresh this new project.

On 26 October, the user approved the two Settings → Wedding details screens.
Their original HTML and screenshots are archived separately in `wedding-details`
with screen IDs in its manifest. The live exposed MCP connection again required
authentication; the direct configured-header fallback retrieved both references.
Generated state inspectors, platform status decorations and location photography
are omitted from the product. The current `--export` helper still refreshes only
the eight original workspace references, not these two settings exports.

`npm run design:check` checks this exact Google MCP endpoint through a read-only
request. `npm run design:check -- --export` refreshes the eight reference exports.
The helper first uses a developer `STITCH_API_KEY` environment variable, then
reads the existing local Codex Stitch configuration in memory. It never modifies
Codex configuration, copies keys into this repository or prints provider bodies.
Do not put a Stitch key in application `.env.example` or `NEXT_PUBLIC_*` variables.
Never pass a key on the command line or paste it into project documentation.

Diagnosis on 25 October: exposed Stitch tools returned “Authentication required”
while direct requests with the existing configured header returned HTTP 200 and
retrieved the approved screens. This establishes a working fallback; it does not
prove why the active tool connection failed. Refresh/restart the Codex connection
after changing MCP configuration. Keep future credentials in environment-backed
headers rather than embedding additional plaintext credentials. The existing
working user configuration has not been rewritten.

Codex supports static and environment-backed HTTP headers; see the
[official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp).
No integration can guarantee permanent availability. Local approved exports let
feature development continue when the live connector is unavailable.
