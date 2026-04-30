# F014 Postgres Storage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with Postgres, remove production `createNull`/stub storage seams, and add one `.env`-driven Docker Compose file for local development plus single-host production.

**Architecture:** `packages/api` remains the imperative shell. Routes depend on the `StoreBackend` interface, the production `Store` class implements that interface with Postgres, and test-only fakes live under `packages/api/src/__tests__/`. Migrations are Postgres SQL run by the API on startup.

**Tech Stack:** TypeScript, Express, `pg`, Docker Compose, Vitest, Supertest, pnpm.

---

## File Structure

- Modify: `docs/specs/f014-postgres-storage-refactor.md` - already approved; keep aligned if implementation finds a spec gap.
- Modify: `packages/api/src/config.ts` - replace `GOTIT_DB_PATH` with `GOTIT_DATABASE_URL`.
- Modify: `packages/api/src/server.ts` - create Postgres-backed `Store` from `databaseUrl`.
- Modify: `packages/api/src/infra/store.ts` - remove SQLite, remove `createNull`, remove production in-memory backend, implement async Postgres storage.
- Modify: `packages/api/migrations/001_init.sql` - port schema to Postgres dialect.
- Create: `packages/api/src/__tests__/fakes/store.ts` - test-local fake implementing `StoreBackend`.
- Modify: `packages/api/src/__tests__/helper.ts` - use the test-local store fake by default.
- Modify: route and middleware files that call `deps.store` - await async store methods.
- Modify: route tests under `packages/api/src/__tests__/integration/routes/` - remove direct `Store.createNull()` usage.
- Rename/replace: `packages/api/src/__tests__/unit/infra/store.test.ts` -> `packages/api/src/__tests__/integration/infra/store.postgres.test.ts`.
- Modify: `packages/api/package.json` - replace SQLite deps with `pg`, add Postgres test script.
- Modify: `.env.template` - document `GOTIT_DATABASE_URL`, Compose variables, clean reset, and dev/prod `.env` guidance.
- Create: `.dockerignore` - keep Docker build context small.
- Create: `packages/api/Dockerfile` - API image used by the single Compose file.
- Create: `docker-compose.yml` - the only Compose file; reads `.env` and supports both local development and single-host production.

## Task 1: Configuration Contract

**Files:**

- Modify: `packages/api/src/__tests__/unit/config.test.ts`
- Modify: `packages/api/src/config.ts`
- Modify: `.env.template`

- [x] **Step 1.1: Update config tests first**

Replace `GOTIT_DB_PATH` expectations with `GOTIT_DATABASE_URL`.

```typescript
// packages/api/src/__tests__/unit/config.test.ts
it('parses a fully populated env', () => {
  const cfg = loadConfig({
    OPENAI_API_KEY: 'sk-test',
    GOTIT_OPENAI_MODEL: 'gpt-test',
    GOTIT_LLM_CONNECTOR: 'openai',
    GOTIT_LLM_BASE_URL: '',
    GOTIT_LLM_API_KEY: '',
    GOTIT_DATABASE_URL: 'postgres://gotit:gotit@localhost:5432/gotit',
    GOTIT_DATA_DIR: '/tmp/data',
    GOTIT_VAULT_PATH: '/tmp/vault',
    PORT: '4000',
    LOG_LEVEL: 'debug',
  })
  expect(cfg.databaseUrl).toBe('postgres://gotit:gotit@localhost:5432/gotit')
  expect(cfg.dataDir).toBe('/tmp/data')
  expect(cfg.vaultPath).toBe('/tmp/vault')
})

it('applies the default Postgres database URL', () => {
  const cfg = loadConfig({ OPENAI_API_KEY: 'sk-test' })
  expect(cfg.databaseUrl).toBe('postgres://gotit:gotit@localhost:5432/gotit')
})
```

- [x] **Step 1.2: Run config tests to verify failure**

Run: `pnpm --filter @got-it/api test:unit -- src/__tests__/unit/config.test.ts`

Expected: FAIL because `databaseUrl` does not exist and `dbPath` is still returned.

- [x] **Step 1.3: Implement config rename**

Change `ConfigSchema` and `Config` in `packages/api/src/config.ts`.

```typescript
const DEFAULT_DATABASE_URL = 'postgres://gotit:gotit@localhost:5432/gotit'

const ConfigSchema = z.object({
  OPENAI_API_KEY: z.string().default(''),
  GOTIT_OPENAI_MODEL: z.string().default('gpt-4.1'),
  GOTIT_LLM_CONNECTOR: z.enum(['openai', 'local', 'ollama', 'external']).default('openai'),
  GOTIT_LLM_BASE_URL: z.string().default(''),
  GOTIT_LLM_API_KEY: z.string().default(''),
  GOTIT_DATABASE_URL: z.string().url().default(DEFAULT_DATABASE_URL),
  GOTIT_DATA_DIR: z.string().default('./data'),
  GOTIT_VAULT_PATH: z.string().default(''),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})
```

Return `databaseUrl: parsed.GOTIT_DATABASE_URL` and remove `dbPath`.

- [x] **Step 1.4: Update `.env.template` storage section**

Replace the SQLite block with:

```dotenv
# Postgres connection string. Local Docker Compose default:
# postgres://gotit:gotit@localhost:5432/gotit
# Compose service-to-service URL. If running the API from the host with pnpm,
# override this in .env.local with postgres://gotit:gotit@localhost:5432/gotit.
GOTIT_DATABASE_URL=postgres://gotit:gotit@postgres:5432/gotit

# Clean reset: F014 does not migrate SQLite data. To reset storage, drop the
# Postgres database or remove the Docker volume used by Compose.
```

- [x] **Step 1.5: Run config tests to verify pass**

Run: `pnpm --filter @got-it/api test:unit -- src/__tests__/unit/config.test.ts`

Expected: PASS.

- [x] **Step 1.6: Commit**

```bash
git add packages/api/src/config.ts packages/api/src/__tests__/unit/config.test.ts .env.template
git commit -m "feat(api): switch config to postgres database url"
```

## Task 2: Test-Local Store Fake

**Files:**

- Create: `packages/api/src/__tests__/fakes/store.ts`
- Modify: `packages/api/src/__tests__/helper.ts`
- Modify: route tests under `packages/api/src/__tests__/integration/routes/`

- [x] **Step 2.1: Create the test-local fake**

Create `packages/api/src/__tests__/fakes/store.ts`.

```typescript
import { v4 as uuid } from 'uuid'
import type { Message, Session, DeviceId, SessionId } from '@got-it/shared'
import type { Device, StoreBackend } from '../../infra/store.js'

/** Test-only storage fake for unit and non-live route integration tests. */
export class FakeStoreBackend implements StoreBackend {
  private readonly devices = new Map<DeviceId, Device>()
  private readonly byToken = new Map<string, DeviceId>()
  private readonly sessions = new Map<SessionId, Session>()
  private readonly messages = new Map<SessionId, Message[]>()

  async registerDevice({ install_id }: { install_id: string }) {
    for (const device of this.devices.values()) {
      if (device.install_id === install_id) {
        return { device_id: device.id, token: device.token }
      }
    }
    const id = uuid()
    const token = uuid()
    const device: Device = {
      id,
      install_id,
      token,
      active_session_id: null,
      created_at: new Date().toISOString(),
    }
    this.devices.set(id, device)
    this.byToken.set(token, id)
    return { device_id: id, token }
  }

  async findDeviceByToken(token: string) {
    const id = this.byToken.get(token)
    return id ? (this.devices.get(id) ?? null) : null
  }

  async createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const session: Session = {
      id: uuid(),
      device_id,
      started_at: now.toISOString(),
      ended_at: null,
      title: null,
    }
    this.sessions.set(session.id, session)
    return session
  }

  async setActiveSession({
    device_id,
    session_id,
  }: {
    device_id: DeviceId
    session_id: SessionId
  }) {
    const device = this.devices.get(device_id)
    if (device) {
      device.active_session_id = session_id
    }
  }

  async getActiveSession(device_id: DeviceId) {
    const device = this.devices.get(device_id)
    if (!device?.active_session_id) {
      return null
    }
    return this.sessions.get(device.active_session_id) ?? null
  }

  async listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return [...this.sessions.values()]
      .filter((session) => session.device_id === device_id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit)
  }

  async getSession(session_id: SessionId) {
    return this.sessions.get(session_id) ?? null
  }

  async appendMessage(message: Message) {
    const messages = this.messages.get(message.session_id) ?? []
    messages.push(message)
    this.messages.set(message.session_id, messages)
  }

  async listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    return (this.messages.get(session_id) ?? []).slice(-limit)
  }
}

export function createFakeStoreBackend(): StoreBackend {
  return new FakeStoreBackend()
}
```

- [x] **Step 2.2: Update helper types and default store**

In `packages/api/src/__tests__/helper.ts`, import `StoreBackend`, remove the `Store` value import, import `createFakeStoreBackend`, change `TestAppOptions.store?: StoreBackend`, and default to `createFakeStoreBackend()`.

```typescript
import type { StoreBackend } from '../infra/store.js'
import { createFakeStoreBackend } from './fakes/store.js'

type TestAppOptions = {
  store?: StoreBackend
  visionAI?: VisionAI
  chatAI?: ChatAI
  obsidianWriter?: ObsidianWriter
} & Partial<
  Pick<
    AppDeps,
    'visionPrompt' | 'chatPersonaPrompt' | 'vaultPath' | 'captureFolder' | 'dataDir' | 'version'
  >
>

export function createTestApp(opts: TestAppOptions = {}): Express {
  mkdirSync(TEST_TMP_ROOT, { recursive: true })

  return createApp({
    store: opts.store ?? createFakeStoreBackend(),
    visionAI: opts.visionAI ?? createVisionAIMock().instance,
    chatAI: opts.chatAI ?? createChatAIMock().instance,
    obsidianWriter: opts.obsidianWriter ?? createObsidianWriterMock().instance,
    visionPrompt: opts.visionPrompt ?? DEFAULT_VISION_PROMPT,
    chatPersonaPrompt: opts.chatPersonaPrompt ?? DEFAULT_CHAT_PROMPT,
    vaultPath: opts.vaultPath ?? tmpPath('vault'),
    captureFolder: opts.captureFolder ?? DEFAULT_CAPTURE_FOLDER,
    dataDir: opts.dataDir ?? tmpPath('data'),
    version: opts.version ?? 'test',
  })
}
```

- [x] **Step 2.3: Convert route tests away from `Store.createNull()`**

For every route test that currently imports `Store` only to call `Store.createNull()`, remove that import and use `createFakeStoreBackend()`.

Example for `packages/api/src/__tests__/integration/routes/device.test.ts`:

```typescript
import { createFakeStoreBackend } from '../../fakes/store.js'

it('returns the same device on repeated registration with same install_id', async () => {
  const store = createFakeStoreBackend()
  const app = createTestApp({ store })
  const r1 = await request(app).post('/device').send({ install_id: 'inst-1' })
  const r2 = await request(app).post('/device').send({ install_id: 'inst-1' })
  expect(r1.body.device_id).toBe(r2.body.device_id)
})
```

- [x] **Step 2.4: Run route tests to expose async interface work**

Run: `pnpm --filter @got-it/api test:integration`

Expected: FAIL or typecheck failure until `StoreBackend` and route callers are async-aware.

- [ ] **Step 2.5: Commit**

Commit only after Task 3 makes the tests pass.

## Task 3: Async Store Contract And Route Callers

**Files:**

- Modify: `packages/api/src/infra/store.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/middleware/auth.ts`
- Modify: `packages/api/src/routes/device.ts`
- Modify: `packages/api/src/routes/sessions.ts`
- Modify: `packages/api/src/routes/capture.ts`
- Modify: `packages/api/src/routes/chat.ts`
- Modify: `packages/api/src/routes/save.ts`
- Modify: tests touched by Task 2

- [x] **Step 3.1: Change route-facing dependency to `StoreBackend`**

In `packages/api/src/app.ts`:

```typescript
import type { StoreBackend } from './infra/store.js'

export type AppDeps = {
  store: StoreBackend
  visionAI: VisionAI
  chatAI: ChatAI
  obsidianWriter: ObsidianWriter
  visionPrompt: string
  chatPersonaPrompt: string
  vaultPath: string
  captureFolder: string
  dataDir: string
  version: string
}
```

- [x] **Step 3.2: Make `StoreBackend` async**

In `packages/api/src/infra/store.ts`, change the interface:

```typescript
export interface StoreBackend {
  registerDevice(args: { install_id: string }): Promise<{ device_id: DeviceId; token: string }>
  findDeviceByToken(token: string): Promise<Device | null>
  createSession(args: { device_id: DeviceId; now: Date }): Promise<Session>
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }): Promise<void>
  getActiveSession(device_id: DeviceId): Promise<Session | null>
  listSessions(args: { device_id: DeviceId; limit: number }): Promise<Session[]>
  getSession(session_id: SessionId): Promise<Session | null>
  appendMessage(message: Message): Promise<void>
  listMessages(args: { session_id: SessionId; limit: number }): Promise<Message[]>
}
```

- [x] **Step 3.3: Update auth middleware**

In `packages/api/src/middleware/auth.ts`, use `StoreBackend` and await lookup.

```typescript
import type { StoreBackend } from '../infra/store.js'

export function deviceAuth(store: StoreBackend) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (token.length === 0) {
      res.status(401).json({ error: 'missing bearer token' })
      return
    }
    const device = await store.findDeviceByToken(token)
    if (!device) {
      res.status(401).json({ error: 'invalid bearer token' })
      return
    }
    req.device = device
    next()
  }
}
```

- [x] **Step 3.4: Update route handlers to await store calls**

Apply these exact caller rules:

- `await deps.store.registerDevice(...)`
- `await deps.store.createSession(...)`
- `await deps.store.setActiveSession(...)`
- `await deps.store.getActiveSession(...)`
- `await deps.store.listSessions(...)`
- `await deps.store.getSession(...)`
- `await deps.store.appendMessage(...)`
- `await deps.store.listMessages(...)`

Example for `packages/api/src/routes/device.ts`:

```typescript
const result = await deps.store.registerDevice({ install_id: parsed.data.install_id })
res.status(201).json(result)
```

Example for message writes:

```typescript
await deps.store.appendMessage(userMessage)
await deps.store.appendMessage(assistantMessage)
```

- [x] **Step 3.5: Run typecheck to catch missed awaits**

Run: `pnpm --filter @got-it/api typecheck`

Expected: FAIL until every route treats store methods as promises.

- [x] **Step 3.6: Finish route updates and run tests**

Run:

```bash
pnpm --filter @got-it/api typecheck
pnpm --filter @got-it/api test:integration
```

Expected: PASS for both commands.

- [ ] **Step 3.7: Commit Tasks 2 and 3**

```bash
git add packages/api/src/app.ts packages/api/src/middleware/auth.ts packages/api/src/routes packages/api/src/__tests__
git commit -m "test(api): move storage tests to explicit fakes"
```

## Task 4: Postgres Driver, Migration Runner, And Store Implementation

**Files:**

- Modify: `packages/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/api/migrations/001_init.sql`
- Modify: `packages/api/src/infra/store.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 4.1: Install Postgres driver and remove SQLite driver**

Run:

```bash
pnpm --filter @got-it/api remove better-sqlite3 @types/better-sqlite3
pnpm --filter @got-it/api add pg
pnpm --filter @got-it/api add -D @types/pg
```

Expected: `packages/api/package.json` has `pg`, `@types/pg`; no `better-sqlite3`.

- [ ] **Step 4.2: Port migration to Postgres**

Replace `packages/api/migrations/001_init.sql` with:

```sql
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  active_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  title TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_device
  ON sessions(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS images (
  ref TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4.3: Implement Postgres `Store`**

Replace SQLite imports and backends in `packages/api/src/infra/store.ts`.

Core structure:

```typescript
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { v4 as uuid } from 'uuid'
import type { Message, Session, DeviceId, SessionId } from '@got-it/shared'

export class Store implements StoreBackend {
  private constructor(private readonly pool: Pool) {}

  static async create(args: { databaseUrl: string; migrationsDir: string }): Promise<Store> {
    const pool = new Pool({ connectionString: args.databaseUrl })
    await runMigrations(pool, args.migrationsDir)
    return new Store(pool)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async registerDevice({ install_id }: { install_id: string }) {
    const existing = await this.pool.query<{ id: string; token: string }>(
      'SELECT id, token FROM devices WHERE install_id = $1',
      [install_id]
    )
    if (existing.rows[0]) {
      return { device_id: existing.rows[0].id, token: existing.rows[0].token }
    }
    const id = uuid()
    const token = uuid()
    await this.pool.query(
      'INSERT INTO devices(id, install_id, token, active_session_id, created_at) VALUES ($1, $2, $3, NULL, $4)',
      [id, install_id, token, new Date().toISOString()]
    )
    return { device_id: id, token }
  }
}

async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const client = await pool.connect()
  try {
    const files = readdirSync(migrationsDir)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()
    for (const fileName of files) {
      const sql = readFileSync(resolve(migrationsDir, fileName), 'utf8')
      await client.query(sql)
    }
  } finally {
    client.release()
  }
}
```

Implement every method from `StoreBackend`. Use `$1`, `$2` parameters. For `payload JSONB`, pass `JSON.stringify(message)` on insert and return rows with `payload as Message`.

- [ ] **Step 4.4: Update server startup**

In `packages/api/src/server.ts`, await store creation before `createApp`.

```typescript
async function main(): Promise<void> {
  const store = await Store.create({
    databaseUrl: cfg.databaseUrl,
    migrationsDir: resolve(pkgRoot, 'migrations'),
  })
  const llm = LLMConnectorConfig.fromConfig(cfg)

  const app = createApp({
    store,
    visionAI: VisionAI.create(llm),
    chatAI: ChatAI.create(llm),
    obsidianWriter: ObsidianWriter.create(),
    visionPrompt: DEFAULT_VISION_PROMPT,
    chatPersonaPrompt: DEFAULT_CHAT_PROMPT,
    vaultPath: cfg.vaultPath,
    captureFolder: 'GotIt!',
    dataDir: cfg.dataDir,
    version: pkg.version,
  })

  app.listen(cfg.port, () => {
    console.warn(`got-it api listening on ${cfg.port}`)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 4.5: Run typecheck**

Run: `pnpm --filter @got-it/api typecheck`

Expected: PASS after all store methods and server startup are async-correct.

- [ ] **Step 4.6: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml packages/api/migrations/001_init.sql packages/api/src/infra/store.ts packages/api/src/server.ts
git commit -m "feat(api): replace sqlite store with postgres"
```

## Task 5: Real Postgres Storage Tests

**Files:**

- Create: `packages/api/src/__tests__/integration/infra/store.postgres.test.ts`
- Modify: `packages/api/package.json`

- [ ] **Step 5.1: Add Postgres test script**

Add to `packages/api/package.json` scripts:

```json
"test:integration:postgres": "vitest run src/__tests__/integration/infra/store.postgres.test.ts"
```

- [ ] **Step 5.2: Add real Postgres store tests**

Create `packages/api/src/__tests__/integration/infra/store.postgres.test.ts`.

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { resolve } from 'node:path'
import { Store } from '../../../infra/store.js'
import type { Message } from '@got-it/shared'

const databaseUrl = process.env.GOTIT_DATABASE_URL ?? 'postgres://gotit:gotit@localhost:5432/gotit'
const migrationsDir = resolve('migrations')

describe('Store (Postgres)', () => {
  let store: Store
  let pool: Pool

  beforeAll(async () => {
    store = await Store.create({ databaseUrl, migrationsDir })
    pool = new Pool({ connectionString: databaseUrl })
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE images, messages, sessions, devices RESTART IDENTITY CASCADE')
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('issues a device token and looks it up', async () => {
    const { device_id, token } = await store.registerDevice({ install_id: 'inst-1' })
    expect(device_id).toBeTruthy()
    expect(token).toBeTruthy()
    await expect(store.findDeviceByToken(token)).resolves.toEqual(
      expect.objectContaining({ id: device_id, install_id: 'inst-1' })
    )
  })

  it('keeps device registration idempotent by install_id', async () => {
    const first = await store.registerDevice({ install_id: 'inst-1' })
    const second = await store.registerDevice({ install_id: 'inst-1' })
    expect(second).toEqual(first)
  })

  it('creates a session and sets it active', async () => {
    const { device_id } = await store.registerDevice({ install_id: 'inst-1' })
    const session = await store.createSession({
      device_id,
      now: new Date('2026-04-28T10:00:00Z'),
    })
    await store.setActiveSession({ device_id, session_id: session.id })
    await expect(store.getActiveSession(device_id)).resolves.toEqual(session)
  })

  it('round-trips message payloads through jsonb', async () => {
    const { device_id } = await store.registerDevice({ install_id: 'inst-1' })
    const session = await store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    const message: Message = {
      id: 'm1',
      session_id: session.id,
      kind: 'user_text',
      text: 'hello',
      source: 'text',
      created_at: '2026-04-28T10:00:01Z',
    }
    await store.appendMessage(message)
    await expect(store.listMessages({ session_id: session.id, limit: 50 })).resolves.toEqual([
      message,
    ])
  })
})
```

- [ ] **Step 5.3: Run Postgres test before Docker files**

Run: `pnpm --filter @got-it/api test:integration:postgres`

Expected: FAIL if Postgres is not running. If Postgres is already running at `GOTIT_DATABASE_URL`, expected PASS.

- [ ] **Step 5.4: Commit**

```bash
git add packages/api/package.json packages/api/src/__tests__/integration/infra/store.postgres.test.ts
git commit -m "test(api): cover postgres store contract"
```

## Task 6: Docker Compose And API Image

**Files:**

- Create: `.dockerignore`
- Create: `packages/api/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 6.1: Create `.dockerignore`**

```dockerignore
.git
.husky
node_modules
packages/*/node_modules
apps/*/.build
tmp
data
.env.local
coverage
dist
```

- [ ] **Step 6.2: Create API Dockerfile**

Create `packages/api/Dockerfile`.

```dockerfile
FROM node:22.16-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
WORKDIR /app/packages/api

CMD ["pnpm", "exec", "tsx", "src/server.ts"]
```

- [ ] **Step 6.3: Create single `.env`-driven Compose file**

Create `docker-compose.yml`. This is the only Compose file for F014. It reads runtime values from `.env` through Compose interpolation and `env_file`.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - .env
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-gotit}
      POSTGRES_USER: ${POSTGRES_USER:-gotit}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-gotit}
    ports:
      - '${POSTGRES_PORT:-5432}:5432'
    volumes:
      - gotit_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"']
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    restart: unless-stopped
    env_file:
      - .env
    environment:
      GOTIT_DATABASE_URL: ${GOTIT_DATABASE_URL:-postgres://gotit:gotit@postgres:5432/gotit}
      GOTIT_DATA_DIR: ${GOTIT_DATA_DIR:-/app/data}
      GOTIT_VAULT_PATH: /vault
      PORT: ${PORT:-3000}
    ports:
      - '${GOTIT_API_PORT:-3000}:${PORT:-3000}'
    volumes:
      - gotit_api_data:/app/data
      - ${GOTIT_HOST_VAULT_PATH:-./tmp/docker-vault}:/vault
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  gotit_postgres_data:
  gotit_api_data:
```

- [ ] **Step 6.4: Update `.env.template` with Compose variables**

Ensure `.env.template` includes the variables consumed by `docker-compose.yml`:

```dotenv
POSTGRES_DB=gotit
POSTGRES_USER=gotit
POSTGRES_PASSWORD=gotit
POSTGRES_PORT=5432
GOTIT_DATABASE_URL=postgres://gotit:gotit@postgres:5432/gotit
GOTIT_HOST_VAULT_PATH=./tmp/docker-vault
GOTIT_VAULT_PATH=/vault
GOTIT_API_PORT=3000
```

- [ ] **Step 6.5: Validate Compose syntax**

Run:

```bash
docker compose config
```

Expected: PASS using values from `.env` or `.env.template`-equivalent shell values.

- [ ] **Step 6.6: Commit**

```bash
git add .dockerignore packages/api/Dockerfile docker-compose.yml .env.template
git commit -m "feat: add docker compose postgres deployment"
```

## Task 7: Docker-Backed Validation

**Files:**

- Modify: `packages/api/package.json` if scripts need adjustment
- Modify: plan checkboxes only as each command passes

- [ ] **Step 7.1: Start local Postgres**

Run: `docker compose up -d postgres`

Expected: `postgres` becomes healthy.

- [ ] **Step 7.2: Run Postgres storage tests**

Run:

```bash
GOTIT_DATABASE_URL=postgres://gotit:gotit@localhost:5432/gotit pnpm --filter @got-it/api test:integration:postgres
```

Expected: PASS.

- [ ] **Step 7.3: Run normal API tests**

Run:

```bash
pnpm --filter @got-it/api test:unit
pnpm --filter @got-it/api test:integration
```

Expected: PASS. These tests must not require real Postgres.

- [ ] **Step 7.4: Run API container smoke health check**

Run:

```bash
GOTIT_LLM_CONNECTOR=local GOTIT_LLM_BASE_URL=http://localhost:11434/v1 docker compose up -d --build
curl -sS -i http://localhost:3000/health
```

Expected: HTTP 200 from `/health`.

- [ ] **Step 7.5: Stop Compose services**

Run: `docker compose down`

Expected: Containers stop. Volumes remain unless explicitly removed.

- [ ] **Step 7.6: Commit script adjustments if made**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "test(api): wire postgres validation script"
```

Skip this commit only if no script changes were made in Task 7.

## Task 8: Remove SQLite And Nullable Storage References

**Files:**

- Modify: `packages/api/src/__tests__/unit/infra/store.test.ts`
- Modify: route tests and helper files still referencing `Store.createNull`
- Modify: docs touched by F014 reconciliation if needed

- [ ] **Step 8.1: Delete old unit store test**

Remove `packages/api/src/__tests__/unit/infra/store.test.ts` after `store.postgres.test.ts` covers the real store contract.

- [ ] **Step 8.2: Grep production source for banned storage seams**

Run:

```bash
rg -n "createNull|Store\\.createNull|class .*Null|class .*Stub|InMemoryBackend|better-sqlite3|GOTIT_DB_PATH" packages/api/src packages/api/package.json .env.template
```

Expected: no matches except test-local fake names under `packages/api/src/__tests__/` when the grep includes tests. There must be no matches under `packages/api/src/infra`.

- [ ] **Step 8.3: Grep tests for old `Store.createNull` usage**

Run:

```bash
rg -n "Store\\.createNull|createNull\\(\\)" packages/api/src/__tests__
```

Expected: no matches.

- [ ] **Step 8.4: Run API quality checks**

Run:

```bash
pnpm --filter @got-it/api typecheck
pnpm --filter @got-it/api lint
pnpm --filter @got-it/api test
```

Expected: PASS.

- [ ] **Step 8.5: Commit cleanup**

```bash
git add packages/api/src packages/api/package.json pnpm-lock.yaml .env.template
git commit -m "refactor(api): remove sqlite and nullable storage seams"
```

## Task 9: Environment Documentation

**Files:**

- Modify: `.env.template`

- [ ] **Step 9.1: Add single-file Compose notes to `.env.template`**

Add deployment notes directly to `.env.template`.

```dotenv
# F014 uses one docker-compose.yml for local development and single-host production.
# Docker Compose reads this file through env_file and variable interpolation.
# For local host-based pnpm dev, put host-only overrides in .env.local, for example:
# GOTIT_DATABASE_URL=postgres://gotit:gotit@localhost:5432/gotit
#
# Start the full single-host stack:
# docker compose up -d --build
#
# Start only Postgres for host-based development:
# docker compose up -d postgres
#
# Clean reset: F014 does not migrate SQLite data. To discard all Postgres data:
# docker compose down
# docker volume rm got-it_gotit_postgres_data
```

- [ ] **Step 9.2: Validate `.env.template` is referenced by Compose**

Run: `docker compose config`

Expected: PASS and rendered `api` plus `postgres` services contain values from `.env`.

- [ ] **Step 9.3: Commit env docs**

```bash
git add .env.template
git commit -m "docs: document compose environment"
```

## Task 10: Final Validation And Spec Conformance

**Files:**

- Modify: `docs/plans/f014-postgres-storage-refactor.md` checkboxes only as commands pass

- [ ] **Step 10.1: Run full repository validation**

Run: `pnpm validate`

Expected: PASS.

- [ ] **Step 10.2: Run Docker-backed Postgres validation**

Run:

```bash
docker compose up -d postgres
GOTIT_DATABASE_URL=postgres://gotit:gotit@localhost:5432/gotit pnpm --filter @got-it/api test:integration:postgres
docker compose down
```

Expected: PASS and services stopped.

- [ ] **Step 10.3: Run spec-conformance grep**

Run:

```bash
rg -n "better-sqlite3|GOTIT_DB_PATH|Store\\.createNull|InMemoryBackend|class .*Null|class .*Stub" packages/api/src packages/api/package.json .env.template
```

Expected: no production-source matches. Test-local fake storage under `packages/api/src/__tests__/fakes/store.ts` is allowed only when grepping the full test tree for `FakeStoreBackend`.

- [ ] **Step 10.4: Confirm F014 acceptance criteria**

Manually check each item in `docs/specs/f014-postgres-storage-refactor.md` section 8 against code and command output.

Expected: every acceptance criterion has code or command evidence.

- [ ] **Step 10.5: Commit final plan checkbox updates**

```bash
git add docs/plans/f014-postgres-storage-refactor.md
git commit -m "docs: mark f014 implementation plan progress"
```

Only commit checkbox updates for steps actually completed by the implementor in that session.

## Plan Self-Review

- Spec coverage: Tasks 1-5 cover Postgres runtime, migrations, config, store wrapper, test seams, dependencies. Task 6 covers the single `.env`-driven Compose file for local and single-host Docker deployment. Task 9 covers clean reset and dev/prod env notes. Task 10 covers validation and spec conformance.
- Placeholder scan: This plan contains no open-ended implementation placeholders. Every command has an expected result.
- Type consistency: `databaseUrl`, `StoreBackend`, `Store`, `FakeStoreBackend`, `GOTIT_DATABASE_URL`, and `Postgres storage tests` match the F014 spec terminology.
