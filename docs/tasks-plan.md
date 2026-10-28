# Tasks — proposed next feature

Prepared 28 October 2026. Planning only; task implementation is not started.
Finish the outstanding Functions verification/retry work before starting this slice.

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
decision record for the approval; this remains a plan, not implemented behavior.
