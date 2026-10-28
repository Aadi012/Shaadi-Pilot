# Tasks — implementation plan

Prepared and authorized 28 October 2026. Implementation is underway; see project
status for actual verification and remaining review. Functions and Tasks now use
durable create receipts; browser walkthroughs remain distinct from HTTP tests.

## Delivered scope to target

- Both Admins and Managers create, view, edit, reassign and archive wedding tasks.
- Required title; optional description, due date/time, active organizer assignee
  and active function. Unassigned tasks are valid.
- Three statuses: To Do, In Progress, Completed, persisted as todo/inProgress/done.
- Filter by status, assignee, function and due date, with bounded cursor paging.
- Dashboard shows real incomplete/overdue tasks and completion summaries. The
  function detail can show related tasks once this module supplies them.
- No recurring tasks, comments, notifications, automated reminders or new queues.

## Build order

1. Inspect actual approved Tasks list/board and form/detail screenshots. Reuse the
   existing workspace shell and brand. Request only missing references.
2. Confirm due-date semantics and removed-assignee handling below. Document task
   fields, DTOs, archive behavior and list filters before implementation.
3. Add a tasks module with module-owned models/repositories/services and explicit
   wedding-prefixed indexes. Validate every assignee/function within the wedding.
4. Implement `/api/v1/tasks` GET/POST and `/api/v1/tasks/{taskId}` GET/PATCH/DELETE.
   Use current server membership, role enforcement, Origin/CSRF and stale-wedding
   guards. PATCH/DELETE require the reviewed version; safe create retries use
   durable idempotency rather than creating duplicates after a lost response.
5. Serialize assignee/function validation and writes through the shared wedding
   transaction lock so Manager removal and function archival cannot race past a
   stale reference check. Future removal workflows must follow the same convention.
6. Build list/filter and create/edit forms with draft preservation on failure and
   reset after confirmed discard/success. Show truthful empty/error/pending states.
7. Add dashboard/function detail summaries, excluding archived tasks consistently.
8. Verify both roles, tenant boundaries, stale edits, removed assignees, function
   deletion races, retries, filter pagination and overdue boundaries. Exercise
   actual browser form submissions and running Next HTTP handlers, then run check,
   isolated integration/HTTP tests and build. Update status with actual evidence.

## Decisions approved — 28 October 2026

1. Due dates: the PRD says due date while the API/database use dueAt. User approved:
   an optional explicit date and time in the wedding timezone, stored as a UTC
   instant. A task is overdue only while incomplete and dueAt is earlier than now.
   No due date means never overdue. DST ambiguity must be handled explicitly.
2. Removed assignees: Manager removal currently preserves historical assignments.
   User approved: show “Former organizer — reassign” without resolving another
   wedding's profile; keep history, disallow new assignment to inactive/nonmembers,
   and allow an organizer to clear or replace the assignee. Do not auto-delete tasks.

Keep historical identity visibility within approved wedding scope; raw User IDs
must not authorize cross-wedding profile lookups. No new product policy is silently
approved beyond the two explicit choices recorded above. See the architecture
decision record for the approval and project status for implementation evidence.

## Implemented contract

- Canonical field is assignedToUserId (the system-design shorthand used
  assigneeUserId); optional eventId, dueAt and assignee are explicitly nullable.
  Title is 1–160 trimmed characters, description at most 2,000. Unknown fields
  are rejected. PATCH accepts a nonempty subset; statuses retain the source API
  values. createdBy/updatedBy, archive timestamp and version are server-owned.
- GET supports status, assignedToUserId (or unassigned), eventId (or none),
  dueAfter (inclusive), dueBefore (exclusive), overdue=true, limit (1–100, default 25) and a cursor tied to those filters. Lists order by descending record ID.
  Ranges use UTC instants converted from explicit wedding-local controls.
- /api/v1/tasks/options supplies a paged, same-wedding active organizer projection
  for both roles; it exposes no email addresses or membership-management actions.
  Function options reuse the existing paged events API.
- POST requires a UUID Idempotency-Key. Receipts contain scoped record ID and
  payload hash, not duplicated organizer profiles. The shared wedding write and
  receipt insertion commit with creation. Matching retries return the current
  record; a later archive returns conflict rather than recreating it. Receipts
  have no TTL, avoiding a hidden replay window; retention is release work.
- PATCH/DELETE require a strong quoted numeric If-Match. DELETE accepts empty
  content and archives; it never removes assignments or linked function history.
  Archived task references still block function removal under the approved rule.
- Assignment stores the membership generation as well as User ID, so rejoining
  does not silently reclaim an old assignment. Existing former assignments can
  be preserved while changing other fields, cleared, or replaced. Clear then
  reassign to explicitly use a later membership generation of the same account.
- Dashboard summaries include real total/completed/overdue counts and the current
  organizer's incomplete queue. Function details show up to five related tasks
  and link to the filtered task registry. No realtime sync is claimed.
