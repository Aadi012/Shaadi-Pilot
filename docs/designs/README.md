# Approved Stitch references

Project: https://stitch.withgoogle.com/projects/7444919587454097178

The user approved the welcome, wedding details and overview designs on
25 October 2026. Eight desktop/mobile reference screens are archived under
`wedding-workspace`, with screen names/IDs in `references.json`. The populated
variants guide future planning-module work; the current slice implements creation
and an empty overview. Exported HTML is reference material only: never execute its
scripts, import its CDN dependencies or ship its state inspector controls.

## Connection checks and fallback

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
