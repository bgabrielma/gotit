# F014 - Postgres Storage Refactor

> Status: Draft (pending user review)
> Owner: Brainstorming session 2026-04-30
> Depends on: F001 Phase 1a Plan B started
> Blocks: F013 Obsidian Plugin Delivery, F002 Advanced Obsidian Workflows

## 1. Goal

Replace the backend SQLite storage implementation with Postgres and make Docker Compose the supported deployment shape for both local development and single-host production.

F014 is an infrastructure refactor. It must preserve the existing API behavior, route contracts, session semantics, message semantics, save behavior, and Functional Core / Imperative Shell boundaries.

## 2. Scope

### 2.1 In scope

| Area              | Requirement                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database runtime  | Postgres is the only supported runtime database for `packages/api` after F014.                                                                       |
| Store wrapper     | The existing `Store` infrastructure wrapper stays as the route-facing storage abstraction.                                                           |
| Migrations        | `packages/api/migrations/` contains Postgres-dialect SQL and is run by the API at startup.                                                           |
| Configuration     | `GOTIT_DATABASE_URL` replaces `GOTIT_DB_PATH`.                                                                                                       |
| Docker local dev  | Compose can start a local Postgres service and the API can connect to it.                                                                            |
| Docker production | Compose supports single-host production deployment: API container plus Postgres container, persistent Postgres volume, and environment-based config. |
| Clean reset       | Existing SQLite `.db` files are not migrated. Developers and deployments start with an empty Postgres database.                                      |
| Tests             | Existing route behavior remains covered. Storage tests cover the Postgres-backed `Store` contract.                                                   |
| Dependencies      | Remove `better-sqlite3` and `@types/better-sqlite3`; add a Postgres driver and needed types.                                                         |

### 2.2 Out of scope

| Item                                 | Reason                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| SQLite-to-Postgres data migration    | Clean reset is the selected strategy. Current data is pre-MVP development data.                     |
| Dual SQLite/Postgres runtime support | Keeping two database paths increases maintenance burden and undermines the refactor.                |
| ORM or query-builder adoption        | The current table set and query surface are small enough for direct SQL.                            |
| Multi-host orchestration             | F014 targets single-host Docker Compose, not Kubernetes, Swarm, ECS, Nomad, or Terraform.           |
| Managed database provisioning        | Production may use an external Postgres via `GOTIT_DATABASE_URL`, but provisioning is not included. |
| Product behavior changes             | F014 does not alter capture, chat, save, auth, session, history, or Obsidian behavior.              |
| F013 save delivery changes           | Plugin delivery and `pending / delivered / failed` save state remain in F013.                       |

## 3. Dependency Decision

`BOARD.md` says F014 starts once F001 Phase 1a Plan B starts. `STATUS.md` records Plan B as started on 2026-04-29. F014 is therefore unblocked for planning and may proceed before F001 is fully complete.

F014 must not update `STATUS.md` during implementation. The validator updates `STATUS.md` only after a passing validation score.

## 4. Architecture

### 4.1 Existing boundary

The API routes depend on `Store`, not on SQLite directly. F014 keeps that boundary:

```
packages/api routes and middleware
  -> Store
    -> Postgres backend
      -> pg Pool
        -> Postgres
```

Routes, middleware, and tests continue to call the same `Store` methods:

- `registerDevice`
- `findDeviceByToken`
- `createSession`
- `setActiveSession`
- `getActiveSession`
- `listSessions`
- `getSession`
- `appendMessage`
- `listMessages`

`Store.createNull()` remains an in-memory test backend. It does not become a nullable production backend and is not used by server startup.

### 4.2 Postgres backend

The Postgres backend owns:

- Creating a connection pool from `GOTIT_DATABASE_URL`.
- Running migrations from `packages/api/migrations/`.
- Executing SQL for the existing `StoreBackend` contract.
- Returning plain shared-domain objects matching current route expectations.
- Closing the pool when explicit cleanup is needed by tests.

The backend must not leak `pg` row types into routes.

### 4.3 Migrations

`001_init.sql` is ported to Postgres dialect:

- IDs remain application-generated strings.
- Timestamps remain ISO strings at the API boundary.
- Message `payload` should use `jsonb` internally.
- Foreign keys remain enforced.
- Indexes remain equivalent to current query patterns.

Startup migration behavior must be idempotent. Re-running the API against an existing Postgres volume must not fail when schema already exists.

## 5. Docker Deployment

### 5.1 Local development

Local development uses Docker Compose to start Postgres with stable defaults:

- Database: `gotit`
- User: `gotit`
- Password: `gotit`
- Port: `5432`
- URL: `postgres://gotit:gotit@localhost:5432/gotit`

The API may still be run from the host with `pnpm dev`, connected to the Compose Postgres service via `GOTIT_DATABASE_URL`.

### 5.2 Single-host production

F014 includes a single-host Docker deployment path:

- API runs as a container.
- Postgres runs as a container.
- Postgres data persists in a named Docker volume.
- API receives `GOTIT_DATABASE_URL` from environment.
- API receives AI/provider and storage configuration from environment.
- The production Compose path does not bake secrets into committed files.

Production can alternatively point the API container at an externally managed Postgres instance by changing `GOTIT_DATABASE_URL`. F014 does not provision that external database.

### 5.3 Clean reset

There is no SQLite import path. To reset local or single-host production data, the operator drops the Postgres database or removes the Docker volume. This must be documented in `.env.template` or deployment notes added by the implementation plan.

## 6. Configuration

`GOTIT_DATABASE_URL` replaces `GOTIT_DB_PATH`.

`loadConfig` exposes:

```typescript
databaseUrl: string
```

The default development URL is:

```text
postgres://gotit:gotit@localhost:5432/gotit
```

`GOTIT_DB_PATH` is removed from:

- `packages/api/src/config.ts`
- `.env.template`
- Tests
- F001 references touched during F014 reconciliation

## 7. Testing Strategy

### 7.1 Unit and route tests

Existing API route tests should keep using explicit test doubles and `Store.createNull()` unless they are specifically testing Postgres behavior. This preserves fast test feedback and follows the shell testing policy.

### 7.2 Postgres integration tests

F014 adds focused Postgres-backed storage tests that exercise the same `Store` contract against a real Postgres database:

- Device registration is idempotent by `install_id`.
- Token lookup returns the matching device.
- Sessions can be created and activated.
- Active session lookup works.
- Sessions list newest first.
- Messages append and list in chronological order.
- Message payload round-trips through `jsonb`.

These tests may require a running Postgres service and should be clearly separated from mocked route tests if they cannot run without Docker.

### 7.3 Full validation

The validator runs the standard quality pipeline:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm purity-check
```

If Postgres integration tests require Docker, the implementation plan must define the exact command and environment required to run them.

## 8. Acceptance Criteria

- [ ] `BOARD.md` lists F014 in progress and points to this spec.
- [ ] `packages/api` no longer depends on `better-sqlite3`.
- [ ] `packages/api` uses Postgres via `GOTIT_DATABASE_URL`.
- [ ] `Store` route-facing method names and behavior remain stable.
- [ ] Existing route tests still pass without requiring real Postgres.
- [ ] Focused Postgres storage tests pass against a real Postgres database.
- [ ] Migrations are Postgres dialect and idempotent.
- [ ] Docker Compose supports local Postgres.
- [ ] Docker Compose supports single-host production with API plus Postgres containers.
- [ ] `.env.template` documents `GOTIT_DATABASE_URL` and clean-reset behavior.
- [ ] No SQLite data migration path exists.
- [ ] `pnpm validate` passes, plus any documented Docker-backed Postgres test command.

## 9. Sprint Contract — F014 Postgres Storage Refactor

### Success Criteria

- [ ] Replace SQLite storage with Postgres while preserving API behavior.
- [ ] Make Docker Compose the supported local development and single-host production deployment path.
- [ ] Use `GOTIT_DATABASE_URL` as the storage configuration boundary.
- [ ] Keep `Store.createNull()` for test-side in-memory route tests.
- [ ] Add real Postgres storage validation.
- [ ] Remove SQLite runtime dependencies and config.
- [ ] Document clean reset; do not implement SQLite data migration.

### Quality Gate

- Minimum score: 7/10
- Scoring breakdown:
  - Functionality: 30%
  - Code quality: 20%
  - Test coverage: 20%
  - Spec conformance: 20%
  - Lint + types: 10%

The validator must confirm no product behavior changed and no SQLite runtime path remains.

## 10. Terminology

| Term                        | Required meaning                                                               |
| --------------------------- | ------------------------------------------------------------------------------ |
| `Postgres Storage Refactor` | F014 feature name.                                                             |
| `Store`                     | API storage infrastructure wrapper consumed by routes and auth middleware.     |
| `Postgres backend`          | Concrete `StoreBackend` implementation backed by Postgres.                     |
| `GOTIT_DATABASE_URL`        | Only runtime database configuration variable after F014.                       |
| `clean reset`               | Explicit decision to not migrate existing SQLite data.                         |
| `single-host production`    | Docker Compose deployment with API and Postgres containers on one Docker host. |
| `Postgres storage tests`    | Tests that run the `Store` contract against real Postgres.                     |
