# Module conventions

Create modules as their first behavior is implemented. Empty feature directories
and placeholder CRUD are intentionally deferred.

| Module      | Owns                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `auth`      | Organizer identity, passwords, opaque sessions and recovery            |
| `members`   | Membership invitations, joining, roles and removal                     |
| `weddings`  | Tenant creation, profile, website settings and public projections      |
| `events`    | Functions, timing, venues and schedule publication                     |
| `tasks`     | Assignments, deadlines and status                                      |
| `expenses`  | Paid entries and exact totals under the approved correction policy     |
| `vendors`   | Saved vendor information and Places discovery                          |
| `guests`    | Contacts, per-event invitations, RSVP capabilities and headcounts      |
| `gallery`   | Gallery capabilities, photo metadata, upload verification and deletion |
| `email`     | Templates, MongoDB work records, batching and retry recovery           |
| `dashboard` | Authorized read-only summaries across modules                          |

A typical module grows into:

```text
tasks/
  contracts.ts
  task.model.server.ts
  task.repository.server.ts
  task.service.server.ts
  task.service.test.ts
  components/
```

- Contracts contain browser-safe Zod schemas and DTO types; never Mongoose models.
- Models define persisted shapes, indexes and local validation.
- Repositories own queries. Require trusted wedding context for tenant operations,
  including reads, aggregates, nested references and mutations.
- Services own authorization policies, invariants, transactions and coordination.
- Route Handlers under `src/app/api/v1` parse HTTP, establish the principal, enforce
  CSRF where applicable, validate input, invoke services and return explicit DTOs.
- UI components own presentation; they do not import server persistence code.
- Cross-module calls use exposed service operations or contracts, not another
  module's models or repositories. Avoid circular dependencies.
- Keep invitations and RSVPs in `guests`, and website settings in `weddings`,
  until actual complexity justifies a new boundary.
- Use `import 'server-only'` in server modules. The `.server.ts` suffix documents
  the boundary but is not itself an import guard.

No base repository hierarchy, service container, internal event bus or generic
CRUD framework is needed for V1. Test domain behavior where it lives; place
cross-module, database and HTTP integration tests under `tests/integration` when
those features exist.
