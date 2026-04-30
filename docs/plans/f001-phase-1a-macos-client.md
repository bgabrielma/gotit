# F001 Phase 1a — macOS Client (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the macOS-native imperative shell for F001 Phase 1a — menu-bar app with floating chat panel, native screenshot routing, "Look again" recapture, text chat round-trip against the backend, and direct Markdown save to a user-picked vault folder. End state: `xcodebuild test -scheme GotIt` and `pnpm test:macos` pass; the app builds with a Free Apple ID; the manual smoke checklist (spec §11.5) passes; backend amendments (`POST /save/:id/result`, idempotent `POST /device`, save returns draft markdown instead of writing) ship in the same plan so the client and server contracts agree.

**Architecture:** Functional Core / Imperative Shell. Three local SPM packages with compiler-enforced module boundaries: `GotItModels` (pure DTOs), `GotItInfra` (protocols + live wrappers around `URLSession`, `ScreenCaptureKit`, `NSMetadataQuery`, `KeyboardShortcuts`, `FileManager`, `Keychain`), `GotItUI` (SwiftUI views + view models that consume protocols only). The thin app target hosts `@main`, `AppDependencies` (the single DI root that calls `make...Live(...)`), and `AppConfig` (validated config). The only Phase 1a Swift-side pure helper is `resolveCollision`. Tests use Swift Testing (`@Test`) plus test-side fakes/recorders under `Tests/.../Helpers`; production `Sources/` modules must not contain `Null*` or stub backends. Backend amendments switch `POST /save` from filesystem write to a draft response and add `POST /save/:id/result` for client-reported delivery outcome.

**Tech Stack:** Swift 6, Xcode 16+, macOS 13 Ventura+, SwiftUI, SPM (local packages), `KeyboardShortcuts` (sindresorhus), `ScreenCaptureKit`, `NSMetadataQuery`, `NSPanel`, `URLSession`, `Keychain Services`, `FileManager`, security-scoped bookmarks, Swift Testing, XCUITest. Backend: existing Node 22 / Express / TypeScript stack (changes confined to `packages/api`, `packages/shared` already has `SaveDraftResponseSchema`).

---

## Spec References

- **Spec:** `docs/specs/f001-phase-1a-macos-client.md` (sub-spec, source of truth for this plan)
- **Parent spec:** `docs/specs/f001-screen-capture-mvp.md`
- **Backend plan (completed):** `docs/plans/f001-phase-1a-backend.md`
- **Architecture rules:** `CLAUDE.md` (FC/IS, no mocks in core, strict types, Husky gates)
- **Manual smoke checklist:** sub-spec §11.5

Phase 1b (mic), 1c (Listen), 1d (history), F013 (Obsidian plugin), F005 (stealth) are **out of scope** here.

## Validator-Fix Notes

- **Swift test doubles policy:** This plan resolves the inherited spec §11.3 conflict with `AGENTS.md` by keeping all Swift fake/recording implementations in test targets only (`Tests/.../Helpers` or app test bundles). Production protocol factories expose `makeLive(...)` only. Tests instantiate fakes directly after `@testable import`; production modules never import test helpers.
- **Backend message contract:** Task 1 updates `packages/shared/src/domain.ts` before API code so `save_record` carries `vault_relative_path`, `markdown`, `delivered_at`, and `final_path`. Existing `vault_path` consumers are renamed in the same task.
- **Endpoint typing:** Task 6 uses `struct Endpoint<Response>` with typed static factories, not a generic enum with heterogeneous cases.

## File Structure

```
got-it/
├── apps/macos/                                  (NEW)
│   ├── GotIt.xcodeproj/                         (create — generated)
│   ├── App/
│   │   ├── GotItApp.swift                       (create — @main, NSApplicationDelegate, LSUIElement)
│   │   ├── AppDelegate.swift                    (create — lifecycle hooks)
│   │   ├── AppDependencies.swift                (create — DI root)
│   │   ├── AppConfig.swift                      (create — validated config)
│   │   ├── AppConfigTests.swift                 (create — in App target test bundle)
│   │   └── Info.plist                           (create)
│   ├── Resources/
│   │   └── Assets.xcassets/                     (create — app icon + menu-bar icon)
│   ├── Packages/
│   │   ├── GotItModels/
│   │   │   ├── Package.swift
│   │   │   ├── Sources/GotItModels/
│   │   │   │   ├── Session.swift
│   │   │   │   ├── Message.swift
│   │   │   │   ├── AnalysisResult.swift
│   │   │   │   ├── APIRequests.swift
│   │   │   │   └── APIResponses.swift
│   │   │   └── Tests/GotItModelsTests/
│   │   │       └── CodableRoundTripTests.swift
│   │   ├── GotItInfra/
│   │   │   ├── Package.swift                    (depends on GotItModels + KeyboardShortcuts)
│   │   │   ├── Sources/GotItInfra/
│   │   │   │   ├── API/
│   │   │   │   │   ├── APIClient.swift          (protocol + live factory only)
│   │   │   │   │   ├── Endpoint.swift           (typed struct + static factories)
│   │   │   │   │   ├── APIError.swift
│   │   │   │   │   └── URLSessionAPIClient.swift (internal)
│   │   │   │   ├── Capture/
│   │   │   │   │   ├── ScreenCaptureService.swift (protocol + factory)
│   │   │   │   │   ├── LiveScreenCaptureService.swift
│   │   │   │   ├── Screenshot/
│   │   │   │   │   ├── ScreenshotWatcher.swift  (protocol + factory)
│   │   │   │   │   ├── LiveScreenshotWatcher.swift
│   │   │   │   ├── Hotkey/
│   │   │   │   │   ├── HotkeyRegistrar.swift    (protocol + factory)
│   │   │   │   │   ├── LiveHotkeyRegistrar.swift
│   │   │   │   ├── Files/
│   │   │   │   │   ├── MarkdownFileWriter.swift (protocol + factory)
│   │   │   │   │   ├── LiveMarkdownFileWriter.swift
│   │   │   │   │   └── ResolveCollision.swift   (PURE helper)
│   │   │   │   ├── Bookmarks/
│   │   │   │   │   ├── SecureBookmarkStore.swift (protocol + factory)
│   │   │   │   │   ├── LiveSecureBookmarkStore.swift
│   │   │   │   ├── Keychain/
│   │   │   │   │   ├── KeychainStore.swift      (protocol + factory)
│   │   │   │   │   ├── LiveKeychainStore.swift
│   │   │   │   │   └── InstallIDStore.swift     (protocol + factories)
│   │   │   │   ├── Permissions/
│   │   │   │   │   ├── DeviceCapabilities.swift (protocol + factory)
│   │   │   │   │   ├── LiveDeviceCapabilities.swift
│   │   │   │   ├── Network/
│   │   │   │   │   ├── OfflineMonitor.swift     (protocol + factory)
│   │   │   │   │   ├── LiveOfflineMonitor.swift
│   │   │   │   └── Logging/
│   │   │   │       └── Logger.swift             (os.Logger wrapper)
│   │   │   └── Tests/GotItInfraTests/
│   │   │       ├── APIClientTests.swift
│   │   │       ├── ResolveCollisionTests.swift
│   │   │       ├── KeychainStoreTests.swift
│   │   │       ├── MarkdownFileWriterTests.swift
│   │   │       ├── SecureBookmarkStoreTests.swift
│   │   │       ├── OfflineMonitorTests.swift
│   │   │       └── Helpers/                      (Fake* + Recording* test doubles only)
│   │   └── GotItUI/
│   │       ├── Package.swift                    (depends on GotItModels + GotItInfra)
│   │       ├── Sources/GotItUI/
│   │       │   ├── Panel/
│   │       │   │   ├── FloatingPanel.swift
│   │       │   │   └── PanelHostingView.swift
│   │       │   ├── Chat/
│   │       │   │   ├── ChatView.swift
│   │       │   │   ├── MessageRow.swift
│   │       │   │   └── InputBar.swift
│   │       │   ├── Settings/
│   │       │   │   ├── SettingsWindow.swift
│   │       │   │   ├── VaultFolderPicker.swift
│   │       │   │   └── HotkeyRecorder.swift
│   │       │   ├── Onboarding/
│   │       │   │   └── FirstRunBackendStep.swift
│   │       │   ├── Common/
│   │       │   │   ├── OfflineBanner.swift
│   │       │   │   └── PermissionPrompt.swift
│   │       │   └── ViewModels/
│   │       │       ├── PanelViewModel.swift
│   │       │       ├── ChatViewModel.swift
│   │       │       └── SettingsViewModel.swift
│   │       └── Tests/GotItUITests/
│   │           ├── PanelViewModelTests.swift
│   │           ├── ChatViewModelTests.swift
│   │           └── SettingsViewModelTests.swift
│   └── GotItUITests/                            (XCUITest target)
│       └── Phase1aSmokeTests.swift
│
├── packages/shared/src/api.ts                   (modify — add SaveResultRequestSchema, mark POST /device idempotent in JSDoc)
├── packages/shared/src/domain.ts                (modify — save_record Message union)
│
├── packages/api/src/                            (modify — backend amendments)
│   ├── routes/save.ts                           (modify — return draft, do not write)
│   ├── routes/save-result.ts                    (create — POST /save/:id/result)
│   ├── routes/device.ts                         (verify idempotent — modify if not)
│   ├── app.ts                                   (modify — wire saveResultRouter)
│   ├── infra/store.ts                           (modify — add getSaveRecord + recordSaveResult to StoreBackend + Store)
│   ├── migrations/002_save_drafts.sql           (create — intentionally empty; delivered_at/final_path stored in messages.payload JSONB)
│   └── __tests__/integration/routes/
│       ├── save.test.ts                         (modify)
│       └── save-result.test.ts                  (create)
│
├── package.json                                 (modify — add `test:macos` script)
├── .husky/pre-push                              (modify — gate `pnpm test:macos` if apps/macos changed)
└── docs/plans/f001-phase-1a-macos-client.md     (this file)
```

---

## Task 1: Backend Amendments — Save Draft Contract + Save Result Endpoint

The current `POST /save` writes the markdown to `deps.obsidianWriter` and returns `{ vault_path, save_record_id }`. Phase 1a Plan B requires the backend to **stop touching the filesystem**: return `{ vault_relative_path, markdown, save_record_id }` and add `POST /save/:id/result { delivered: boolean, final_path?: string }` for the client to report delivery. `SaveDraftResponseSchema` already exists in `packages/shared/src/api.ts` — wire it in.

**Files:**

- Modify: `packages/api/src/routes/save.ts`
- Create: `packages/api/src/routes/save-result.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/domain.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/infra/store.ts` (add `getSaveRecord` + `recordSaveResult` to `StoreBackend` interface and `Store` class)
- Create: `packages/api/migrations/002_save_drafts.sql`
- Modify: `packages/api/src/__tests__/integration/routes/save.test.ts`
- Create: `packages/api/src/__tests__/integration/routes/save-result.test.ts`

- [ ] **Step 1.1: Add `SaveResultRequestSchema` to shared**

In `packages/shared/src/api.ts` after `SaveResponseSchema`:

```ts
export const SaveResultRequestSchema = z.object({
  delivered: z.boolean(),
  final_path: z.string().min(1).optional(),
})
export type SaveResultRequest = z.infer<typeof SaveResultRequestSchema>
```

Re-export from `packages/shared/src/index.ts`.

- [ ] **Step 1.1a: Extend `Message` save_record payload in shared domain**

Edit `packages/shared/src/domain.ts`. Replace the existing `save_record` branch that uses `vault_path` with the Plan B draft/delivery payload:

```ts
  | (MessageBase & {
      kind: 'save_record'
      vault_relative_path: string
      markdown: string
      instruction?: string
      delivered_at: string | null
      final_path: string | null
    })
```

Then grep and update current consumers of `vault_path`:

```bash
rg -n "vault_path" packages/shared/src packages/api/src
```

Expected updates: `packages/api/src/routes/save.ts` writes `vault_relative_path`; save route tests assert `vault_relative_path`; no remaining `vault_path` in active API/shared save-record code.

- [ ] **Step 1.2: Run shared tests; expect pass**

```bash
pnpm --filter @got-it/shared test
```

- [ ] **Step 1.3: Write failing test for new save draft contract**

Edit `packages/api/src/__tests__/integration/routes/save.test.ts`. Replace the assertions that expect `vault_path` with assertions that expect `vault_relative_path` + `markdown` + `save_record_id` and that no file was written:

```ts
it('returns a draft markdown payload and does not write to disk', async () => {
  const writer = { write: vi.fn() }
  const app = createApp({ /* ... */, obsidianWriter: writer })
  const res = await request(app).post('/save').set(authHeader).send({}).expect(201)
  expect(res.body).toMatchObject({
    vault_relative_path: expect.stringMatching(/^GotIt!\/.+\.md$/),
    markdown: expect.stringContaining('---'),
    save_record_id: expect.any(String),
  })
  expect(writer.write).not.toHaveBeenCalled()
})
```

- [ ] **Step 1.4: Run; expect FAIL**

```bash
pnpm --filter @got-it/api test -- save.test
```

Expected failure: response shape mismatch + writer was called.

- [ ] **Step 1.5: Create intentionally-empty migration and extend StoreBackend**

There is no `save_record` table — saves persist as rows in `messages` with `kind='save_record'` and the full message JSON in the `payload` JSONB column (see `infra/store.ts:appendMessage`). `delivered_at` and `final_path` are stored inside that payload via a JSONB merge update.

Create `packages/api/migrations/002_save_drafts.sql` as an intentionally empty (comment-only) file so the migration runner has a stable slot:

```sql
-- F001 Phase 1a: save draft metadata stored in messages.payload JSONB.
-- No schema change required.
```

Then extend `StoreBackend` in `packages/api/src/infra/store.ts`:

```ts
export type SaveRecord = {
  id: string
  session_id: string
  device_id: string
  vault_relative_path: string
  markdown: string
  instruction?: string
  delivered_at: string | null
  final_path: string | null
  created_at: string
}

// Add to StoreBackend interface:
getSaveRecord(id: string): Promise<SaveRecord | null>
recordSaveResult(args: { id: string; delivered: boolean; final_path?: string }): Promise<void>
```

Add implementations to the `Store` class:

```ts
async getSaveRecord(id: string): Promise<SaveRecord | null> {
  const result = await this.pool.query<{ payload: Message; device_id: string }>(
    `SELECT m.payload, s.device_id
     FROM messages m
     JOIN sessions s ON m.session_id = s.id
     WHERE m.id = $1 AND m.kind = 'save_record'`,
    [id]
  )
  if (!result.rows[0]) return null
  const { payload, device_id } = result.rows[0]
  if (payload.kind !== 'save_record') return null
  return {
    id: payload.id,
    session_id: payload.session_id,
    device_id,
    vault_relative_path: payload.vault_relative_path,
    markdown: payload.markdown,
    ...(payload.instruction ? { instruction: payload.instruction } : {}),
    delivered_at: payload.delivered_at,
    final_path: payload.final_path,
    created_at: payload.created_at,
  }
}

async recordSaveResult({ id, delivered, final_path }: { id: string; delivered: boolean; final_path?: string }): Promise<void> {
  const now = delivered ? new Date().toISOString() : null
  await this.pool.query(
    `UPDATE messages
     SET payload = payload
       || jsonb_build_object('delivered_at', $2::text)
       || jsonb_build_object('final_path', $3::text)
     WHERE id = $1 AND kind = 'save_record'`,
    [id, now, final_path ?? null]
  )
}
```

Wire migration into the existing runner: `Store.create` already calls `runMigrations` which runs all `.sql` files sorted — the empty `002_save_drafts.sql` will run without error.

- [ ] **Step 1.6: Implement `getSaveRecord` + `recordSaveResult` in `packages/api/src/infra/store.ts`**

The two methods were defined in Step 1.5. Add them to both the `StoreBackend` interface and the `Store` class exactly as shown. Run typecheck to confirm the interface is satisfied:

```bash
pnpm --filter @got-it/api typecheck
```

Also add `getSaveRecord` + `recordSaveResult` to any in-test store fakes used in existing integration test helpers (check `packages/api/src/__tests__/`) — add stubs that satisfy the interface even if not under test yet.

- [ ] **Step 1.7: Rewrite `POST /save` to return the draft**

The existing handler (see `save.ts:L36-51`) has an AI override branch: when `plan.template !== 'default'`, it calls `deps.chatAI.complete(overridePayload)` to generate the body using a custom instruction. **This branch must be preserved.** Only the Obsidian write and response shape change.

Replace `packages/api/src/routes/save.ts` body following this structure:

```ts
// KEEP: existing plan/body computation including AI override branch (save.ts:L36-51)
const plan = resolveSaveFormat(parsed.data.instruction)
let body: string
if (plan.template === 'default') {
  body = lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : ''
} else {
  // ... AI override via deps.chatAI.complete — unchanged
}

// KEEP: title/slug/filename/relativePath/contents computation
const contents = formatObsidianEntry({ ... })

// REMOVE: deps.obsidianWriter.write(...) block
// CHANGE: appendMessage record → use appendMessage with kind='save_record' (existing behavior)
// The save_record message already stores vault_relative_path and markdown via payload JSONB.
const record: Message = {
  id: uuid(),
  session_id: session.id,
  kind: 'save_record',
  vault_relative_path: relativePath,
  markdown: contents,
  ...(plan.instruction ? { instruction: plan.instruction } : {}),
  delivered_at: null,
  final_path: null,
  created_at: new Date().toISOString(),
}
await deps.store.appendMessage(record)

// CHANGE: response shape
const response = SaveDraftResponseSchema.parse({
  vault_relative_path: relativePath,
  markdown: contents,
  save_record_id: record.id,
})
res.status(201).json(response)
```

Remove the `deps.obsidianWriter.write(...)` call entirely. The `obsidianWriter` dependency can be removed from `AppDeps` if it has no other callers (grep first).

- [ ] **Step 1.8: Run; expect PASS**

```bash
pnpm --filter @got-it/api test -- save.test
```

- [ ] **Step 1.9: Write failing test for `POST /save/:id/result`**

Create `packages/api/src/__tests__/integration/routes/save-result.test.ts`:

```ts
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { createTestApp } from '../../helper.js'

describe('POST /save/:id/result', () => {
  it('records delivery and final_path on an existing save_record', async () => {
    const { app, authHeader, saveRecord } = await createTestApp({ withSaveDraft: true })
    const res = await request(app)
      .post(`/save/${saveRecord.id}/result`)
      .set(authHeader)
      .send({ delivered: true, final_path: '/Users/me/Vault/GotIt!/2026-04-30-foo.md' })
      .expect(204)
    const stored = await app.locals.store.getSaveRecord(saveRecord.id)
    expect(stored.delivered_at).toBeTruthy()
    expect(stored.final_path).toBe('/Users/me/Vault/GotIt!/2026-04-30-foo.md')
  })

  it('returns 404 for unknown id, 400 on invalid body, 401 without device auth', async () => {
    /* three quick assertions */
  })

  it('rejects writes from a device that does not own the save_record (403)', async () => {
    /* ... */
  })
})
```

- [ ] **Step 1.10: Run; expect FAIL**

```bash
pnpm --filter @got-it/api test -- save-result.test
```

- [ ] **Step 1.11: Implement `POST /save/:id/result` route**

Create `packages/api/src/routes/save-result.ts`. `getSaveRecord` joins `messages → sessions` to surface `device_id` for the ownership check (see Step 1.5 implementation — `SaveRecord.device_id` comes from that join):

```ts
import { Router } from 'express'
import { SaveResultRequestSchema } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function saveResultRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))
  r.post('/:id/result', async (req, res) => {
    const parsed = SaveResultRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    const record = await deps.store.getSaveRecord(req.params.id)
    if (!record) {
      res.status(404).json({ error: 'save_record not found' })
      return
    }
    if (record.device_id !== req.device!.id) {
      res.status(403).json({ error: 'not your save_record' })
      return
    }
    await deps.store.recordSaveResult({
      id: record.id,
      delivered: parsed.data.delivered,
      final_path: parsed.data.final_path,
    })
    res.status(204).end()
  })
  return r
}
```

- [ ] **Step 1.12: Wire the router in `app.ts`**

In `packages/api/src/app.ts` after `app.use('/save', saveRouter(deps))`:

```ts
app.use('/save', saveResultRouter(deps))
```

- [ ] **Step 1.13: Run all api tests; expect PASS**

```bash
pnpm --filter @got-it/api test
```

- [ ] **Step 1.14: Verify `POST /device` is idempotent on `install_id`**

Read `packages/api/src/infra/store.ts` `registerDevice`. The existing implementation already checks for an existing row by `install_id` and returns it if found (see `store.ts:L40-58`). Confirm this is wired to the `/device` route, then add the regression test if missing:

```ts
it('returns the same device_id+token for the same install_id', async () => {
  const a = await request(app).post('/device').send({ install_id: 'fixed' }).expect(201)
  const b = await request(app).post('/device').send({ install_id: 'fixed' }).expect(201)
  expect(b.body).toEqual(a.body)
})
```

If already idempotent, just add the test for regression coverage.

- [ ] **Step 1.15: Verify all routes return 401 on missing/unknown/revoked token**

Read `packages/api/src/middleware/auth.ts`. Confirm: missing `Authorization` → 401; bearer token with no matching device → 401; revoked device → 401. Add gap-fill tests if any path returns 403/500.

- [ ] **Step 1.16: Run full pnpm pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 1.17: Commit**

```bash
git add packages/shared packages/api docs/plans/f001-phase-1a-macos-client.md
git commit -m "feat(api): switch /save to draft contract and add /save/:id/result"
```

---

## Task 2: Xcode Project Skeleton + SPM Layout

Bootstrap `apps/macos/` with the thin app target and three local SPM packages. No code yet — just compiling shells with their dependency edges declared.

**Files:**

- Create: `apps/macos/GotIt.xcodeproj/...` (Xcode-generated)
- Create: `apps/macos/App/GotItApp.swift`
- Create: `apps/macos/App/AppDelegate.swift`
- Create: `apps/macos/App/Info.plist`
- Create: `apps/macos/Packages/GotItModels/Package.swift`
- Create: `apps/macos/Packages/GotItInfra/Package.swift`
- Create: `apps/macos/Packages/GotItUI/Package.swift`

- [ ] **Step 2.1: Create the project directory layout**

```bash
mkdir -p apps/macos/App apps/macos/Resources apps/macos/Packages/GotItModels/Sources/GotItModels apps/macos/Packages/GotItModels/Tests/GotItModelsTests apps/macos/Packages/GotItInfra/Sources/GotItInfra apps/macos/Packages/GotItInfra/Tests/GotItInfraTests apps/macos/Packages/GotItUI/Sources/GotItUI apps/macos/Packages/GotItUI/Tests/GotItUITests
```

- [ ] **Step 2.2: Create `GotItModels` Package.swift**

`apps/macos/Packages/GotItModels/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GotItModels",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItModels", targets: ["GotItModels"]),
    ],
    targets: [
        .target(name: "GotItModels"),
        .testTarget(name: "GotItModelsTests", dependencies: ["GotItModels"]),
    ]
)
```

- [ ] **Step 2.3: Add a placeholder source so the package compiles**

`apps/macos/Packages/GotItModels/Sources/GotItModels/GotItModels.swift`:

```swift
public enum GotItModelsVersion {
    public static let value = "0.0.1"
}
```

- [ ] **Step 2.4: Create `GotItInfra` Package.swift with `KeyboardShortcuts` dep**

`apps/macos/Packages/GotItInfra/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GotItInfra",
    platforms: [.macOS(.v13)],
    products: [.library(name: "GotItInfra", targets: ["GotItInfra"])],
    dependencies: [
        .package(path: "../GotItModels"),
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "GotItInfra",
            dependencies: [
                "GotItModels",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ]
        ),
        .testTarget(name: "GotItInfraTests", dependencies: ["GotItInfra"]),
    ]
)
```

Add placeholder `Sources/GotItInfra/GotItInfra.swift`:

```swift
public enum GotItInfraVersion { public static let value = "0.0.1" }
```

- [ ] **Step 2.5: Create `GotItUI` Package.swift**

`apps/macos/Packages/GotItUI/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GotItUI",
    platforms: [.macOS(.v13)],
    products: [.library(name: "GotItUI", targets: ["GotItUI"])],
    dependencies: [
        .package(path: "../GotItModels"),
        .package(path: "../GotItInfra"),
    ],
    targets: [
        .target(name: "GotItUI", dependencies: ["GotItModels", "GotItInfra"]),
        .testTarget(name: "GotItUITests", dependencies: ["GotItUI"]),
    ]
)
```

Placeholder `Sources/GotItUI/GotItUI.swift`:

```swift
public enum GotItUIVersion { public static let value = "0.0.1" }
```

- [ ] **Step 2.6: Verify each package builds in isolation**

```bash
cd apps/macos/Packages/GotItModels && swift build
cd ../GotItInfra && swift build
cd ../GotItUI && swift build
cd ../../../..
```

Expected: three successful builds, `KeyboardShortcuts` resolved on the second.

- [ ] **Step 2.7: Generate the Xcode project**

In Xcode: File → New → Project → macOS → App → Product Name `GotIt`, Interface SwiftUI, Language Swift, no Tests, no Core Data. Save to `apps/macos/`. Replace the auto-generated app sources with the planned `App/` files in subsequent steps; for now keep the default templates.

Move the generated `Info.plist` into `apps/macos/App/Info.plist` and update the build setting `INFOPLIST_FILE = App/Info.plist`. Set:

- `LSUIElement = YES`
- `MACOSX_DEPLOYMENT_TARGET = 13.0`
- `PRODUCT_BUNDLE_IDENTIFIER = dev.gotit.GotIt`
- Signing: Personal Team, Automatically manage signing.
- Capabilities: nothing special yet (Screen Recording / Accessibility prompts come from TCC at runtime).
- App Sandbox: **OFF** for Phase 1a (Screen Recording + arbitrary user-folder writes are simpler without sandbox).
- Hardened Runtime: ON.

Add the three local SPM packages: File → Add Packages → Add Local → select each of `Packages/GotItModels`, `Packages/GotItInfra`, `Packages/GotItUI`. Add `GotItModels`, `GotItInfra`, `GotItUI` to the app target's "Frameworks, Libraries, and Embedded Content".

- [ ] **Step 2.8: Replace the default `ContentView` with a stub `GotItApp`**

`apps/macos/App/GotItApp.swift`:

```swift
import SwiftUI

@main
struct GotItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        Settings { EmptyView() }   // menu-bar-only; no main window scene
    }
}
```

`apps/macos/App/AppDelegate.swift`:

```swift
import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }
}
```

Delete the auto-generated `ContentView.swift` and any `*App.swift` Xcode created.

- [ ] **Step 2.9: Build the app target**

In Xcode: Product → Build (⌘B). Expected: success. Run (⌘R) and confirm: no Dock icon appears (LSUIElement = YES + accessory activation policy).

- [ ] **Step 2.10: Add the `pnpm test:macos` script**

Edit root `package.json`:

```json
"scripts": {
  "test:macos": "xcodebuild test -project apps/macos/GotIt.xcodeproj -scheme GotIt -destination 'platform=macOS' -quiet"
}
```

- [ ] **Step 2.11: Verify smoke**

```bash
pnpm test:macos
```

Expected: build + test invocation succeeds (Xcode auto-creates an empty test target if none yet; if it fails because no scheme has tests enabled, defer this verification to Task 3 once `GotItModelsTests` exists).

- [ ] **Step 2.12: Commit**

```bash
git add apps/macos package.json
git commit -m "feat(macos): scaffold GotIt app target and three SPM packages"
```

---

## Task 3: GotItModels — DTOs and Codable Round-Trip

Mirror the backend wire shapes in pure value types. **Codable round-trip tests are the only tests** for this package.

**Files:**

- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/Session.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/Message.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/AnalysisResult.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/APIRequests.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/APIResponses.swift`
- Create: `apps/macos/Packages/GotItModels/Tests/GotItModelsTests/CodableRoundTripTests.swift`
- Delete: `apps/macos/Packages/GotItModels/Sources/GotItModels/GotItModels.swift` (placeholder)

- [ ] **Step 3.1: Write failing test for `AnalysisResult` round-trip**

`Tests/GotItModelsTests/CodableRoundTripTests.swift`:

```swift
import Testing
import Foundation
@testable import GotItModels

@Test func analysisResult_round_trips_against_backend_json() throws {
    let json = """
    {
      "raw_text": "hello",
      "urls": [{"href":"https://x.com","anchor":"x","near_text":"go"}],
      "regions": [{"kind":"paragraph","text":"hi"}],
      "context_kind": "doc",
      "summary": "a summary"
    }
    """.data(using: .utf8)!
    let decoded = try JSONDecoder().decode(AnalysisResult.self, from: json)
    let reencoded = try JSONEncoder().encode(decoded)
    let redecoded = try JSONDecoder().decode(AnalysisResult.self, from: reencoded)
    #expect(redecoded == decoded)
}
```

- [ ] **Step 3.2: Run; expect FAIL**

```bash
cd apps/macos/Packages/GotItModels && swift test
```

Expected: `AnalysisResult` undefined.

- [ ] **Step 3.3: Implement `AnalysisResult`**

`Sources/GotItModels/AnalysisResult.swift`:

```swift
import Foundation

public struct ExtractedURL: Codable, Equatable, Sendable {
    public let href: String
    public let anchor: String?
    public let nearText: String?
    public init(href: String, anchor: String? = nil, nearText: String? = nil) {
        self.href = href; self.anchor = anchor; self.nearText = nearText
    }
    enum CodingKeys: String, CodingKey { case href, anchor, nearText = "near_text" }
}

public struct Region: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case header, paragraph, code, ui, media }
    public struct BBox: Codable, Equatable, Sendable {
        public let x: Double; public let y: Double; public let w: Double; public let h: Double
    }
    public let kind: Kind
    public let text: String
    public let bbox: BBox?
}

public enum ContextKind: String, Codable, Sendable {
    case browser_article, code, chat, video, doc, unknown
}

public struct AnalysisResult: Codable, Equatable, Sendable {
    public let rawText: String
    public let urls: [ExtractedURL]
    public let regions: [Region]
    public let contextKind: ContextKind
    public let summary: String
    enum CodingKeys: String, CodingKey {
        case rawText = "raw_text", urls, regions, contextKind = "context_kind", summary
    }
}
```

- [ ] **Step 3.4: Run; expect PASS**

```bash
swift test
```

- [ ] **Step 3.5: Repeat for `Session`, `Message`, `APIRequests`, `APIResponses`**

For each: write a failing round-trip test pinned to a JSON literal that matches `packages/shared/src/api.ts`, run, implement, run.

`Session.swift`:

```swift
public struct Session: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let deviceId: String
    public let createdAt: String
    public let endedAt: String?
    enum CodingKeys: String, CodingKey {
        case id, deviceId = "device_id", createdAt = "created_at", endedAt = "ended_at"
    }
}
```

`Message.swift` mirrors the union: `screen_capture`, `user_text`, `assistant`, `save_record`. Use a tagged enum with a single `kind` discriminator + per-case associated values. Test each case with a JSON fixture that matches what the backend emits.

`APIRequests.swift`: `DeviceRegistrationRequest`, `ChatRequest { text, source }`, `SaveRequest { instruction? }`, `SaveResultRequest { delivered, final_path? }`, `CaptureSource`, `ChatSource` enums.

`APIResponses.swift`: `DeviceRegistrationResponse { device_id, token }`, `HealthResponse { ok, version }`, `SaveDraftResponse { vault_relative_path, markdown, save_record_id }`, `SessionsListResponse`, `SessionResponse`, etc.

After each, commit per file.

- [ ] **Step 3.6: Delete the placeholder source**

```bash
rm apps/macos/Packages/GotItModels/Sources/GotItModels/GotItModels.swift
```

- [ ] **Step 3.7: Run all tests and commit**

```bash
swift test
cd ../../../..
git add apps/macos/Packages/GotItModels
git commit -m "feat(macos): GotItModels DTOs with Codable round-trip tests"
```

---

## Task 4: AppConfig — Validated Config Boundary

`AppConfig` is the only place that reads `Info.plist` or `UserDefaults`. Everything else takes typed values.

**Files:**

- Create: `apps/macos/App/AppConfig.swift`
- Create: `apps/macos/App/AppConfigTests.swift` (in app target's test bundle, or a small `AppCoreTests` SPM package — **simpler choice: keep as a unit test in the app's existing test bundle**)
- Modify: `apps/macos/App/Info.plist`

- [ ] **Step 4.1: Add Info.plist keys with defaults**

`Info.plist` additions:

```xml
<key>GotItBackendURL</key><string>http://localhost:3000</string>
<key>GotItHealthProbeTimeoutMs</key><integer>1500</integer>
<key>NSCameraUsageDescription</key><string>(unused in Phase 1a)</string>
<key>NSScreenCaptureDescription</key><string>GotIt re-captures your active display when you click "Look again".</string>
```

- [ ] **Step 4.2: Write failing test for `AppConfig.load`**

`AppConfigTests.swift`:

```swift
import Testing
@testable import GotIt

@Test func loads_defaults_from_infoPlist_with_userDefaults_overrides() {
    let info: [String: Any] = [
        "GotItBackendURL": "http://localhost:3000",
        "GotItHealthProbeTimeoutMs": 1500,
    ]
    let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
    defaults.set("https://api.example.com", forKey: "GotItBackendURL")
    let cfg = try AppConfig.load(info: info, defaults: defaults)
    #expect(cfg.backendURL == URL(string: "https://api.example.com"))
    #expect(cfg.healthProbeTimeout == .milliseconds(1500))
    #expect(cfg.autoDetectScreenshots == true)
    #expect(cfg.screenshotGraceSeconds == 3)
}

@Test func rejects_invalid_backend_url() {
    let info: [String: Any] = ["GotItBackendURL": "not a url"]
    #expect(throws: AppConfig.LoadError.self) {
        _ = try AppConfig.load(info: info, defaults: UserDefaults(suiteName: "x")!)
    }
}
```

- [ ] **Step 4.3: Run; expect FAIL**

```bash
pnpm test:macos
```

- [ ] **Step 4.4: Implement `AppConfig`**

`apps/macos/App/AppConfig.swift`:

```swift
import Foundation

public struct AppConfig: Equatable, Sendable {
    public let backendURL: URL
    public let healthProbeTimeout: Duration
    public let autoDetectScreenshots: Bool
    public let screenshotGraceSeconds: Int
    public let installID: String          // owned by InstallIDStore in production; AppConfig holds the resolved value
    public let hotkeyDefault: String      // "Cmd+Shift+Space"

    public enum LoadError: Error, Equatable {
        case missingKey(String)
        case invalidURL(String)
    }

    public static func load(info: [String: Any], defaults: UserDefaults) throws -> AppConfig {
        let configuredURLString = defaults.string(forKey: "GotItBackendURL")
            ?? (info["GotItBackendURL"] as? String)
        guard let urlString = configuredURLString else {
            throw LoadError.missingKey("GotItBackendURL")
        }
        guard let url = URL(string: urlString), url.scheme != nil else { throw LoadError.invalidURL(urlString) }
        let timeoutMs = (info["GotItHealthProbeTimeoutMs"] as? Int) ?? 1500
        let auto = (defaults.object(forKey: "GotItAutoDetectScreenshots") as? Bool) ?? true
        let grace = (defaults.object(forKey: "GotItScreenshotGraceSeconds") as? Int) ?? 3
        let installID = (defaults.string(forKey: "GotItInstallID")) ?? {
            let new = UUID().uuidString
            defaults.set(new, forKey: "GotItInstallID")
            return new
        }()
        return AppConfig(
            backendURL: url,
            healthProbeTimeout: .milliseconds(timeoutMs),
            autoDetectScreenshots: auto,
            screenshotGraceSeconds: grace,
            installID: installID,
            hotkeyDefault: "Cmd+Shift+Space"
        )
    }
}
```

- [ ] **Step 4.5: Run; expect PASS, commit**

```bash
pnpm test:macos
git add apps/macos/App
git commit -m "feat(macos): AppConfig validated config boundary"
```

---

## Task 5: KeychainStore (live + test fake) and InstallIDStore

Bearer token storage. Live wraps `Security.framework`; tests use `FakeKeychainStore` in `Tests/GotItInfraTests/Helpers/` with an in-memory `Dictionary<String, Data>`.

**Files:**

- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/Keychain/KeychainStore.swift`
- Create: `.../Keychain/LiveKeychainStore.swift`
- Create: `.../Keychain/InstallIDStore.swift`
- Create: `apps/macos/Packages/GotItInfra/Tests/GotItInfraTests/KeychainStoreTests.swift`

- [ ] **Step 5.1: Write failing tests against the protocol via the test fake**

```swift
import Testing
@testable import GotItInfra

@Test func fakeKeychain_get_returns_nil_then_value_after_set() throws {
    let kc = FakeKeychainStore()
    #expect(try kc.read("device_token") == nil)
    try kc.write("device_token", value: Data("abc".utf8))
    #expect(try kc.read("device_token") == Data("abc".utf8))
    try kc.delete("device_token")
    #expect(try kc.read("device_token") == nil)
}
```

- [ ] **Step 5.2: Run; expect FAIL**

```bash
cd apps/macos/Packages/GotItInfra && swift test
```

- [ ] **Step 5.3: Define protocol + factory**

`KeychainStore.swift`:

```swift
import Foundation

public protocol KeychainStore: Sendable {
    func read(_ key: String) throws -> Data?
    func write(_ key: String, value: Data) throws
    func delete(_ key: String) throws
}

public enum KeychainStoreFactory {
    public static func makeLive(service: String = "dev.gotit.GotIt") -> KeychainStore {
        LiveKeychainStore(service: service)
    }
}
```

`LiveKeychainStore.swift`: standard `SecItemAdd` / `SecItemCopyMatching` / `SecItemDelete` for `kSecClassGenericPassword`, scoped by `service`. Map non-zero `OSStatus` (other than `errSecItemNotFound`) to a thrown error.

`Tests/GotItInfraTests/Helpers/FakeKeychainStore.swift`:

```swift
final class FakeKeychainStore: KeychainStore, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: Data] = [:]
    func read(_ key: String) throws -> Data? { lock.withLock { store[key] } }
    func write(_ key: String, value: Data) throws { lock.withLock { store[key] = value } }
    func delete(_ key: String) throws { lock.withLock { _ = store.removeValue(forKey: key) } }
}
```

- [ ] **Step 5.4: Add a live-target test guarded by an env opt-in**

```swift
@Test(.enabled(if: ProcessInfo.processInfo.environment["RUN_LIVE_KEYCHAIN"] != nil))
func liveKeychain_round_trips_under_temp_service() throws {
    let kc = KeychainStoreFactory.makeLive(service: "dev.gotit.GotIt.tests.\(UUID().uuidString)")
    try kc.write("k", value: Data("v".utf8))
    #expect(try kc.read("k") == Data("v".utf8))
    try kc.delete("k")
}
```

- [ ] **Step 5.5: Add `InstallIDStore` (UserDefaults-backed)**

`InstallIDStore.swift`:

```swift
public protocol InstallIDStore: Sendable {
    func getOrCreate() -> String
}

public enum InstallIDStoreFactory {
    public static func makeLive(defaults: UserDefaults = .standard) -> InstallIDStore {
        LiveInstallIDStore(defaults: defaults)
    }
}
```

Plus simple test: `getOrCreate()` returns the same value across two calls; test-side `FakeInstallIDStore` returns `seed`.

- [ ] **Step 5.6: Run; expect PASS, commit**

```bash
swift test
git add apps/macos/Packages/GotItInfra
git commit -m "feat(macos): KeychainStore + InstallIDStore with test fakes"
```

---

## Task 5b: Test Helper Definitions

Define all shared test helpers before Tasks 6–18 consume them. Place in `apps/macos/Packages/GotItInfra/Tests/GotItInfraTests/Helpers/` (and `GotItUITests/Helpers/` for `ChatResponse`, `EmptyResponse`, `RecordingFakeAPIClient`).

**Files:**

- Create: `.../GotItInfraTests/Helpers/URLSessionRecording.swift`
- Create: `.../GotItInfraTests/Helpers/TestHelpers.swift` (makeTempDir, makeIsolatedDefaults, LockedArray)
- Create: `.../GotItUITests/Helpers/RecordingFakeAPIClient.swift`
- Create: `.../GotItModels/Sources/GotItModels/` (ChatResponse, EmptyResponse types)

- [ ] **Step 5b.1: Create `URLSession.makeRecording` helper**

`Tests/.../Helpers/URLSessionRecording.swift`:

```swift
import Foundation

struct ScriptedResponse {
    let status: Int
    let body: String
    static func respond(status: Int, body: String = "") -> ScriptedResponse {
        ScriptedResponse(status: status, body: body)
    }
}

struct RequestKey: Hashable {
    let path: String
    let method: String
    static func matching(path: String, method: String) -> RequestKey {
        RequestKey(path: path, method: method)
    }
}

final class TransportRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    var requests: [URLRequest] { lock.withLock { _requests } }
    func record(_ req: URLRequest) { lock.withLock { _requests.append(req) } }
}

extension URLSession {
    static func makeRecording(
        recorder: TransportRecorder? = nil,
        scenarios: [RequestKey: [ScriptedResponse]] = [:]
    ) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        let proto = ScriptedURLProtocol.self
        proto.recorder = recorder
        proto.scenarios = scenarios
        config.protocolClasses = [proto]
        return URLSession(configuration: config)
    }
}

final class ScriptedURLProtocol: URLProtocol, @unchecked Sendable {
    static var recorder: TransportRecorder?
    static var scenarios: [RequestKey: [ScriptedResponse]] = [:]
    private static let lock = NSLock()
    private static var callCounts: [RequestKey: Int] = [:]

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        recorder?.record(request)
        guard let url = request.url,
              let method = request.httpMethod else { fail(); return }
        let key = RequestKey(path: url.path, method: method)
        let response: ScriptedResponse = Self.lock.withLock {
            let idx = Self.callCounts[key, default: 0]
            Self.callCounts[key] = idx + 1
            let list = Self.scenarios[key] ?? []
            return list.indices.contains(idx) ? list[idx] : .respond(status: 404)
        }
        let httpResp = HTTPURLResponse(
            url: url, statusCode: response.status,
            httpVersion: nil, headerFields: nil
        )!
        client?.urlProtocol(self, didReceive: httpResp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(response.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
    private func fail() { client?.urlProtocol(self, didFailWithError: URLError(.badURL)) }
}
```

- [ ] **Step 5b.2: Create `makeTempDir`, `makeIsolatedDefaults`, `LockedArray` helpers**

`Tests/.../Helpers/TestHelpers.swift`:

```swift
import Foundation

func makeTempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory
        .appending(component: UUID().uuidString, directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

func makeIsolatedDefaults() -> UserDefaults {
    let suite = "test-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    return defaults
}

final class LockedArray<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var _values: [T] = []
    var values: [T] { lock.withLock { _values } }
    func append(_ value: T) { lock.withLock { _values.append(value) } }
    var count: Int { lock.withLock { _values.count } }
}
```

- [ ] **Step 5b.3: Define `ChatResponse` and `EmptyResponse` in GotItModels**

These are API response DTOs needed by `ChatViewModel` tests and `RecordingFakeAPIClient`. Add to `GotItModels/Sources/GotItModels/APIResponses.swift`:

```swift
public struct ChatResponse: Codable, Sendable {
    public let message_id: String
    public let text: String
    public let session_id: String
    public init(message_id: String, text: String, session_id: String) {
        self.message_id = message_id; self.text = text; self.session_id = session_id
    }
}

public struct EmptyResponse: Codable, Sendable {
    public init() {}
}
```

- [ ] **Step 5b.4: Define `RecordingFakeAPIClient`**

`Tests/.../GotItUITests/Helpers/RecordingFakeAPIClient.swift`. This is a test-side `APIClient` implementation that returns scripted responses and records calls:

```swift
import GotItModels
import GotItInfra

final class RecordingFakeAPIClient: APIClient, @unchecked Sendable {
    private let lock = NSLock()
    private var _responses: [EndpointID: Any] = [:]
    private var _calls: [EndpointID] = []
    private var _bodies: [EndpointID: EndpointBody] = [:]

    init(responses: [EndpointID: Any]) {
        self._responses = responses
    }

    var calls: [EndpointID] { lock.withLock { _calls } }
    func lastBody(for id: EndpointID) -> EndpointBody? { lock.withLock { _bodies[id] } }

    func send<R: Decodable & Sendable>(_ endpoint: Endpoint<R>) async throws -> R {
        lock.withLock {
            _calls.append(endpoint.id)
            _bodies[endpoint.id] = endpoint.body
        }
        guard let resp = lock.withLock({ _responses[endpoint.id] }) as? R else {
            throw APIError.http(status: 500, body: "no scripted response for \(endpoint.id)")
        }
        return resp
    }
}
```

- [ ] **Step 5b.5: Compile check**

```bash
cd apps/macos && swift build --target GotItInfraTests
swift build --target GotItUITests
```

Expected: no errors.

- [ ] **Step 5b.6: Commit**

```bash
git add apps/macos/Packages
git commit -m "test(macos): add shared test helpers (URLSessionRecording, LockedArray, makeTempDir, RecordingFakeAPIClient)"
```

---

## Task 6: APIClient — Endpoints, URLSession, 401 Revalidation, Retry

The single network seam. Token injection, decoding, retry-with-backoff, 401 → re-pair → retry once, offline gating.

**Files:**

- Create: `Sources/GotItInfra/API/Endpoint.swift`
- Create: `.../API/APIClient.swift`
- Create: `.../API/APIError.swift`
- Create: `.../API/URLSessionAPIClient.swift`
- Create: `Tests/GotItInfraTests/Helpers/FakeAPIClient.swift`
- Create: `Tests/GotItInfraTests/APIClientTests.swift`

- [ ] **Step 6.1: Write failing test — test-side fake client returns canned response**

```swift
@Test func fakeAPI_returns_canned_response_for_health() async throws {
    let api = FakeAPIClient(responses: [
        .health: HealthResponse(ok: true, version: "test")
    ])
    let res: HealthResponse = try await api.send(.health())
    #expect(res.version == "test")
}
```

- [ ] **Step 6.2: Run; expect FAIL**

- [ ] **Step 6.3: Define the protocol + typed endpoint struct**

`Endpoint.swift`:

```swift
public enum EndpointID: Hashable, Sendable {
    case device, health, sessionsActive, sessionsCreate, capture, chat, save, saveResult
}

public struct Endpoint<Response: Decodable & Sendable>: Sendable {
    public let id: EndpointID
    public let method: String
    public let path: String
    public let body: EndpointBody

    private init(id: EndpointID, method: String, path: String, body: EndpointBody = .none) {
        self.id = id
        self.method = method
        self.path = path
        self.body = body
    }
}

public enum EndpointBody: Sendable {
    case none
    case json(any Encodable & Sendable)
    case multipartImage(data: Data, source: CaptureSource)
}

public extension Endpoint where Response == DeviceRegistrationResponse {
    static func device(installID: String) -> Endpoint<Response> {
        Endpoint(id: .device, method: "POST", path: "/device", body: .json(DeviceRegistrationRequest(install_id: installID)))
    }
}

public extension Endpoint where Response == HealthResponse {
    static func health() -> Endpoint<Response> { Endpoint(id: .health, method: "GET", path: "/health") }
}

public extension Endpoint where Response == Session {
    static func sessionsActive() -> Endpoint<Response> { Endpoint(id: .sessionsActive, method: "GET", path: "/sessions/active") }
    static func sessionsCreate() -> Endpoint<Response> { Endpoint(id: .sessionsCreate, method: "POST", path: "/sessions") }
}

public extension Endpoint where Response == CaptureResponse {
    static func capture(image: Data, source: CaptureSource) -> Endpoint<Response> {
        Endpoint(id: .capture, method: "POST", path: "/capture", body: .multipartImage(data: image, source: source))
    }
}

public extension Endpoint where Response == ChatResponse {
    static func chat(text: String, source: ChatSource) -> Endpoint<Response> {
        Endpoint(id: .chat, method: "POST", path: "/chat", body: .json(ChatRequest(text: text, source: source)))
    }
}

public extension Endpoint where Response == SaveDraftResponse {
    static func save(instruction: String?) -> Endpoint<Response> {
        Endpoint(id: .save, method: "POST", path: "/save", body: .json(SaveRequest(instruction: instruction)))
    }
}

public extension Endpoint where Response == EmptyResponse {
    static func saveResult(id: String, delivered: Bool, finalPath: String?) -> Endpoint<Response> {
        Endpoint(id: .saveResult, method: "POST", path: "/save/\(id)/result", body: .json(SaveResultRequest(delivered: delivered, final_path: finalPath)))
    }
}
```

`APIClient.swift`:

```swift
public protocol APIClient: Sendable {
    func send<R: Decodable & Sendable>(_ endpoint: Endpoint<R>) async throws -> R
}

public enum APIClientFactory {
    public static func makeLive(
        baseURL: URL,
        keychain: KeychainStore,
        installID: String,
        session: URLSession = .shared
    ) -> APIClient {
        URLSessionAPIClient(baseURL: baseURL, keychain: keychain, installID: installID, session: session)
    }
}
```

- [ ] **Step 6.4: Implement test-side `FakeAPIClient`**

`Tests/GotItInfraTests/Helpers/FakeAPIClient.swift`:

```swift
final class FakeAPIClient: APIClient, @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [EndpointID: Any]
    private var failures: [EndpointID: APIError]
    private var _calls: [EndpointID] = []

    init(responses: [EndpointID: Any] = [:], failures: [EndpointID: APIError] = [:]) {
        self.responses = responses
        self.failures = failures
    }

    var calls: [EndpointID] { lock.withLock { _calls } }

    func send<R: Decodable & Sendable>(_ endpoint: Endpoint<R>) async throws -> R {
        lock.withLock { _calls.append(endpoint.id) }
        if let failure = lock.withLock({ failures[endpoint.id] }) { throw failure }
        guard let response = lock.withLock({ responses[endpoint.id] }) as? R else {
            throw APIError.decoding("no canned response for \(endpoint.id)")
        }
        return response
    }
}
```

- [ ] **Step 6.5: Run; expect PASS for fake-client test**

- [ ] **Step 6.6: Write failing test for 401 -> re-pair -> retry**

```swift
@Test func unauthorized_triggers_repair_and_retry_once() async throws {
    let recorder = TransportRecorder()
    let kc = FakeKeychainStore()
    try kc.write("device_token", value: Data("stale".utf8))
    let session = URLSession.makeRecording(recorder: recorder, scenarios: [
        .matching(path: "/sessions/active", method: "GET"): [
            .respond(status: 401),
            .respond(status: 200, body: #"{"id":"s1","device_id":"d1","created_at":"...","ended_at":null}"#),
        ],
        .matching(path: "/device", method: "POST"): [
            .respond(status: 201, body: #"{"device_id":"d1","token":"fresh"}"#),
        ],
    ])
    let api = APIClientFactory.makeLive(baseURL: URL(string: "http://h")!, keychain: kc, installID: "i", session: session)
    let s: Session = try await api.send(.sessionsActive())
    #expect(s.id == "s1")
    #expect(try kc.read("device_token") == Data("fresh".utf8))
    #expect(recorder.requests.map(\.path) == ["/sessions/active", "/device", "/sessions/active"])
}
```

- [ ] **Step 6.7: Run; expect FAIL**

- [ ] **Step 6.8: Implement `URLSessionAPIClient` with explicit retry schedule**

```swift
final class URLSessionAPIClient: APIClient {
    private let baseURL: URL
    private let keychain: KeychainStore
    private let installID: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let retryDelays: [Duration] = [.milliseconds(250), .milliseconds(500)]

    func send<R: Decodable & Sendable>(_ endpoint: Endpoint<R>) async throws -> R {
        let req = try buildRequest(for: endpoint)
        return try await sendWithAuth(req, allowRepair: true) { data in
            try decoder.decode(R.self, from: data)
        }
    }

    private func sendWithAuth<R>(_ req: URLRequest, allowRepair: Bool, decode: (Data) throws -> R) async throws -> R {
        do {
            return try await sendWithRetries(req, decode: decode)
        } catch APIError.unauthorized where allowRepair {
            try keychain.delete("device_token")
            try await repair()
            return try await sendWithAuth(req, allowRepair: false, decode: decode)
        }
    }

    private func sendWithRetries<R>(_ req: URLRequest, decode: (Data) throws -> R) async throws -> R {
        for attempt in 0...retryDelays.count {
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse else { throw APIError.transport("non-http response") }
                switch http.statusCode {
                case 200...299: return try decode(data)
                case 401: throw APIError.unauthorized
                case 500...599 where attempt < retryDelays.count:
                    try await Task.sleep(for: retryDelays[attempt])
                    continue
                default:
                    throw APIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8))
                }
            } catch let urlErr as URLError where Self.isTransient(urlErr) && attempt < retryDelays.count {
                try await Task.sleep(for: retryDelays[attempt])
                continue
            }
        }
        throw APIError.transport("exhausted retries")
    }

    private func repair() async throws {
        let req = try buildRequest(for: Endpoint<DeviceRegistrationResponse>.device(installID: installID))
        let parsed: DeviceRegistrationResponse = try await sendWithRetries(req) { data in
            try decoder.decode(DeviceRegistrationResponse.self, from: data)
        }
        try keychain.write("device_token", value: Data(parsed.token.utf8))
    }
}
```

`buildRequest` consumes `Endpoint<Response>.method/path/body`, sets multipart body for `.multipartImage`, JSON body for `.json`, and `Authorization: Bearer <token>` from keychain (omit for `.device` and `.health`). There is **no hidden retry inside a separate `transport()` helper**; retry behavior is exactly two delayed retries with 250ms then 500ms backoff per spec §9.3.

- [ ] **Step 6.9: Run all tests; expect PASS, commit**

```bash
swift test
git add apps/macos/Packages/GotItInfra
git commit -m "feat(macos): APIClient with retry and 401 revalidation"
```

---

## Task 7: OfflineMonitor

Cheap `/health` probe, `isOnline` published state, no background polling. Recheck before each write.

**Files:**

- Create: `Sources/GotItInfra/Network/OfflineMonitor.swift`
- Create: `.../Network/LiveOfflineMonitor.swift`
- Create: `Tests/GotItInfraTests/Helpers/FakeOfflineMonitor.swift`
- Create: `Tests/GotItInfraTests/OfflineMonitorTests.swift`

- [ ] **Step 7.1: Write failing tests**

```swift
@Test func fakeMonitor_starts_online_and_can_be_flipped() async {
    let m = FakeOfflineMonitor(initial: true)
    #expect(await m.isOnline == true)
    await m.set(false)
    #expect(await m.isOnline == false)
}

@Test func liveMonitor_recheck_uses_health_endpoint_and_flips_state() async throws {
    let session = URLSession.makeRecording(scenarios: [
        .matching(path: "/health", method: "GET"): [.respond(status: 200, body: #"{"ok":true,"version":"x"}"#)]
    ])
    let m = OfflineMonitorFactory.makeLive(baseURL: URL(string:"http://h")!, session: session, timeout: .milliseconds(1500))
    #expect(await m.recheck() == true)
}
```

- [ ] **Step 7.2: Implement protocol + actors**

```swift
public protocol OfflineMonitor: Actor {
    var isOnline: Bool { get }
    @discardableResult func recheck() async -> Bool
    func set(_ value: Bool) async   // for tests via FakeOfflineMonitor only
}

public enum OfflineMonitorFactory {
    public static func makeLive(baseURL: URL, session: URLSession = .shared, timeout: Duration) -> OfflineMonitor { ... }
}
```

`recheck()` issues `GET /health` with the configured timeout; non-2xx or any URLError → `isOnline = false`; 2xx → `isOnline = true`.

- [ ] **Step 7.3: Run; expect PASS, commit**

```bash
swift test
git commit -am "feat(macos): OfflineMonitor with /health probe"
```

---

## Task 8: SecureBookmarkStore + ResolveCollision Pure Helper + MarkdownFileWriter

The save pipeline: store the user's vault folder as a security-scoped bookmark, resolve it on demand, run pure collision resolution, write atomically.

**Files:**

- Create: `Sources/GotItInfra/Bookmarks/SecureBookmarkStore.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/FakeSecureBookmarkStore.swift`
- Create: `Sources/GotItInfra/Files/ResolveCollision.swift` (PURE)
- Create: `Sources/GotItInfra/Files/MarkdownFileWriter.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/RecordingMarkdownFileWriter.swift`
- Create: `Tests/GotItInfraTests/SecureBookmarkStoreTests.swift`
- Create: `Tests/GotItInfraTests/ResolveCollisionTests.swift`
- Create: `Tests/GotItInfraTests/MarkdownFileWriterTests.swift`

- [ ] **Step 8.1: Write failing tests for `resolveCollision`**

```swift
@Test func resolveCollision_returns_candidate_when_unique() {
    #expect(resolveCollision(existing: ["a.md","b.md"], candidate: "c.md") == "c.md")
}
@Test func resolveCollision_appends_2_when_taken() {
    #expect(resolveCollision(existing: ["c.md"], candidate: "c.md") == "c-2.md")
}
@Test func resolveCollision_increments_until_free() {
    #expect(resolveCollision(existing: ["c.md","c-2.md","c-3.md"], candidate: "c.md") == "c-4.md")
}
@Test func resolveCollision_preserves_extension_for_dotted_names() {
    #expect(resolveCollision(existing: ["foo.bar.md"], candidate: "foo.bar.md") == "foo.bar-2.md")
}
```

- [ ] **Step 8.2: Run; expect FAIL**

- [ ] **Step 8.3: Implement `resolveCollision` (pure)**

```swift
import Foundation

public func resolveCollision(existing: [String], candidate: String) -> String {
    let set = Set(existing)
    if !set.contains(candidate) { return candidate }
    let url = URL(fileURLWithPath: candidate)
    let ext = url.pathExtension
    let base = url.deletingPathExtension().lastPathComponent
    var n = 2
    while true {
        let next = ext.isEmpty ? "\(base)-\(n)" : "\(base)-\(n).\(ext)"
        if !set.contains(next) { return next }
        n += 1
    }
}
```

No `FileManager`, no I/O. Pure function.

- [ ] **Step 8.4: Run; expect PASS**

- [ ] **Step 8.5: Failing tests for `MarkdownFileWriter`**

```swift
@Test func liveWriter_writes_atomically_into_tempDir_and_resolves_collisions() async throws {
    let dir = try makeTempDir()
    let writer = MarkdownFileWriterFactory.makeLive()
    let p1 = try writer.write(folderURL: dir, relativePath: "GotIt!/foo.md", markdown: "hello")
    let p2 = try writer.write(folderURL: dir, relativePath: "GotIt!/foo.md", markdown: "world")
    #expect(p1.lastPathComponent == "foo.md")
    #expect(p2.lastPathComponent == "foo-2.md")
    let firstContents = try String(contentsOf: p1)
    #expect(firstContents == "hello")
}

@Test func recordingWriter_records_calls_without_touching_disk() throws {
    let writer = RecordingMarkdownFileWriter()
    let url = URL(fileURLWithPath: "/Users/x/Vault")
    _ = try writer.write(folderURL: url, relativePath: "GotIt!/foo.md", markdown: "x")
    #expect(writer.recordedWrites.count == 1)
}
```

- [ ] **Step 8.6: Implement protocol + live writer + test-side recorder**

```swift
public protocol MarkdownFileWriter: Sendable {
    /// Returns the final URL written (post-collision resolution).
    func write(folderURL: URL, relativePath: String, markdown: String) throws -> URL
}

public enum MarkdownFileWriterFactory {
    public static func makeLive() -> MarkdownFileWriter { LiveMarkdownFileWriter() }
}
```

`LiveMarkdownFileWriter`:

1. Compute target subfolder URL = `folderURL.appending(path: relativePath).deletingLastPathComponent()`.
2. `FileManager.default.createDirectory(at: subfolder, withIntermediateDirectories: true)`.
3. Enumerate `subfolder.contents` → `[String]` of filenames.
4. `final = resolveCollision(existing: names, candidate: candidateFilename)`.
5. Write to `subfolder.appending(final)` with `Data(markdown.utf8).write(to: ..., options: .atomic)`.
6. Return the final URL.

`Tests/GotItInfraTests/Helpers/RecordingMarkdownFileWriter.swift` exposes a `recordedWrites: [(folderURL: URL, path: String, markdown: String)]` accumulator; returns a synthetic URL.

- [ ] **Step 8.7: Failing tests for `SecureBookmarkStore`**

```swift
@Test func bookmark_round_trip_under_temp_folder() throws {
    let dir = try makeTempDir()
    let store = SecureBookmarkStoreFactory.makeLive(defaults: makeIsolatedDefaults())
    try store.persist(url: dir, key: "vault")
    let resolved = try store.resolve(key: "vault")
    #expect(resolved.path == dir.path)
}

@Test func fakeStore_remembers_last_persisted_url() throws { ... }
```

- [ ] **Step 8.8: Implement live store + test-side fake**

Live uses `URL.bookmarkData(options: .withSecurityScope, ...)` + `URLDefaults.set(_:forKey:)` + `URL(resolvingBookmarkData:...)` and `startAccessingSecurityScopedResource()`.

- [ ] **Step 8.9: Run all infra tests; expect PASS, commit**

```bash
swift test
git commit -am "feat(macos): SecureBookmarkStore + MarkdownFileWriter + resolveCollision"
```

---

## Task 9: ScreenCaptureService (ScreenCaptureKit)

One-shot screen capture for "Look again". Live wraps SCK; tests use `FakeScreenCaptureService` to return canned image bytes.

**Files:**

- Create: `Sources/GotItInfra/Capture/ScreenCaptureService.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/FakeScreenCaptureService.swift`
- Create: `Tests/GotItInfraTests/ScreenCaptureServiceTests.swift`

- [ ] **Step 9.1: Failing test for fake service**

```swift
@Test func fakeService_returns_seeded_png_bytes() async throws {
    let svc = FakeScreenCaptureService(seededPNG: Data([0x89, 0x50, 0x4E, 0x47]))
    let bytes = try await svc.captureActiveDisplay()
    #expect(bytes.starts(with: [0x89, 0x50, 0x4E, 0x47]))
}

@Test func fakeService_failure_mode_throws() async {
    let svc = FakeScreenCaptureService(failure: .permissionDenied)
    await #expect(throws: ScreenCaptureError.permissionDenied) { _ = try await svc.captureActiveDisplay() }
}
```

- [ ] **Step 9.2: Implement protocol**

```swift
public enum ScreenCaptureError: Error, Equatable, Sendable {
    case permissionDenied
    case noDisplay
    case underlying(String)
}

public protocol ScreenCaptureService: Sendable {
    func captureActiveDisplay() async throws -> Data
}

public enum ScreenCaptureServiceFactory {
    public static func makeLive() -> ScreenCaptureService { LiveScreenCaptureService() }
}
```

`LiveScreenCaptureService` uses `SCShareableContent.current` → first display → `SCStream` one-shot frame → encode to PNG via `CGImageDestination`. Map `SCStreamError` codes ending in unauthorized to `.permissionDenied`.

- [ ] **Step 9.3: Run + commit (live path verified manually per spec §11.5 step 7)**

```bash
swift test
git commit -am "feat(macos): ScreenCaptureService with ScreenCaptureKit live wrapper"
```

---

## Task 10: ScreenshotWatcher (NSMetadataQuery)

Detect macOS-native screenshots and emit them as `URL` events.

**Files:**

- Create: `Sources/GotItInfra/Screenshot/ScreenshotWatcher.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/FakeScreenshotWatcher.swift`
- Create: `Tests/GotItInfraTests/ScreenshotWatcherTests.swift`

- [ ] **Step 10.1: Failing test for fake watcher**

```swift
@Test func fakeWatcher_emits_seeded_urls_to_subscribers() async throws {
    let watcher = FakeScreenshotWatcher()
    let received = LockedArray<URL>()
    let task = Task { for await url in watcher.events { await received.append(url) } }
    try watcher.simulate(URL(fileURLWithPath: "/tmp/a.png"))
    try await Task.sleep(for: .milliseconds(50))
    task.cancel()
    #expect(await received.snapshot == [URL(fileURLWithPath: "/tmp/a.png")])
}
```

- [ ] **Step 10.2: Implement protocol**

```swift
public protocol ScreenshotWatcher: Sendable {
    var events: AsyncStream<URL> { get }
    func start()
    func stop()
}

public enum ScreenshotWatcherFactory {
    public static func makeLive() -> ScreenshotWatcher { LiveScreenshotWatcher() }
`Tests/GotItInfraTests/Helpers/FakeScreenshotWatcher.swift` exposes `simulate(_:)` for tests.
}
```

`LiveScreenshotWatcher` wraps `NSMetadataQuery` with `predicate = NSPredicate(format: "kMDItemIsScreenCapture = 1")`, scope `[NSMetadataQueryUserHomeScope]`, observes `NSMetadataQueryDidUpdateNotification`, and yields each new `kMDItemPath` once.

- [ ] **Step 10.3: Run + commit**

```bash
swift test
git commit -am "feat(macos): ScreenshotWatcher with NSMetadataQuery live wrapper"
```

---

## Task 11: HotkeyRegistrar (KeyboardShortcuts)

Bind `Cmd+Shift+Space` and report conflicts.

**Files:**

- Create: `Sources/GotItInfra/Hotkey/HotkeyRegistrar.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/FakeHotkeyRegistrar.swift`
- Create: `Tests/GotItInfraTests/HotkeyRegistrarTests.swift`

- [ ] **Step 11.1: Failing test**

```swift
@Test func fakeRegistrar_invokes_handler_when_simulated() async {
    let r = FakeHotkeyRegistrar()
    var hits = 0
    r.register(name: .openPanel, handler: { hits += 1 })
    r.simulate(.openPanel)
    #expect(hits == 1)
}
```

- [ ] **Step 11.2: Implement**

```swift
public extension KeyboardShortcuts.Name {
    static let openPanel = Self("gotit.openPanel", default: .init(.space, modifiers: [.command, .shift]))
}

public protocol HotkeyRegistrar: Sendable {
    func register(name: KeyboardShortcuts.Name, handler: @escaping @Sendable () -> Void)
    func unregister(name: KeyboardShortcuts.Name)
}
```

`LiveHotkeyRegistrar` calls `KeyboardShortcuts.onKeyDown(for:action:)`. `FakeHotkeyRegistrar` stores handlers in a dict, exposes `simulate(_:)`.

- [ ] **Step 11.3: Run + commit**

```bash
swift test
git commit -am "feat(macos): HotkeyRegistrar with KeyboardShortcuts live wrapper"
```

---

## Task 12: DeviceCapabilities

Re-probe on launch / `didBecomeActive` / `didChangeScreenParameters` / on demand.

**Files:**

- Create: `Sources/GotItInfra/Permissions/DeviceCapabilities.swift` (+ Live)
- Create: `Tests/GotItInfraTests/Helpers/FakeDeviceCapabilities.swift`
- Create: `Tests/GotItInfraTests/DeviceCapabilitiesTests.swift`

- [ ] **Step 12.1: Failing test for fake capabilities**

```swift
@Test func fakeCaps_publishes_seeded_state() async {
    let caps = FakeDeviceCapabilities(initial: .init(screenRecording: .denied, vault: .unset))
    #expect(await caps.snapshot.screenRecording == .denied)
    await caps.set(\.screenRecording, .granted)
    #expect(await caps.snapshot.screenRecording == .granted)
}
```

- [ ] **Step 12.2: Implement**

```swift
public struct CapabilitySnapshot: Equatable, Sendable {
    public enum Status: Sendable { case unknown, granted, denied, unset }
    public var screenRecording: Status
    public var vault: Status
}

public protocol DeviceCapabilities: Actor {
    var snapshot: CapabilitySnapshot { get }
    func reprobe() async
}
```

Live observes `NSWorkspace.shared.notificationCenter` `didActivateApplicationNotification` (irrelevant — drop), and `NSApplication.didBecomeActiveNotification`, `didChangeScreenParametersNotification`. Probes screen recording via `CGPreflightScreenCaptureAccess()` and vault via `SecureBookmarkStore.resolve(key: "vault")` succeeding.

- [ ] **Step 12.3: Run + commit**

```bash
swift test
git commit -am "feat(macos): DeviceCapabilities with re-probe lifecycle"
```

---

## Task 13: GotItUI — ChatViewModel

Translate user actions into `APIClient` calls. Pure-ish state reducer + side-effect coordinator.

**Files:**

- Create: `Sources/GotItUI/ViewModels/ChatViewModel.swift`
- Create: `Tests/GotItUITests/ChatViewModelTests.swift`

- [ ] **Step 13.1: Failing test — typing + send round-trips through fake APIClient**

```swift
@Test func send_text_appends_user_message_and_assistant_reply() async throws {
    let api = FakeAPIClient(responses: [
        .chat: ChatResponse(message_id: "m1", text: "hi back", session_id: "s1")
    ])
    let vm = await ChatViewModel(api: api, offline: FakeOfflineMonitor())
    await vm.setInput("hello")
    await vm.sendText()
    let messages = await vm.messages
    #expect(messages.count == 2)
    #expect(messages.last?.text == "hi back")
}

@Test func send_text_while_offline_surfaces_banner_and_does_not_call_api() async throws {
    let api = FakeAPIClient(failures: [.chat: .offline])
    let vm = await ChatViewModel(api: api, offline: FakeOfflineMonitor(initial: false))
    await vm.setInput("hello")
    await vm.sendText()
    #expect(await vm.banner == .offline)
    #expect(await vm.messages.isEmpty)
}
```

- [ ] **Step 13.2: Implement `ChatViewModel`** (Swift `@Observable` actor or `@MainActor` class) with `messages: [ChatLine]`, `input`, `banner`, `setInput`, `sendText`, `attachImage`, `lookAgain`, `save`, `reset`. All write actions short-circuit on `await offline.recheck() == false` → set `banner = .offline`.

- [ ] **Step 13.3: Run + commit**

---

## Task 14: GotItUI — PanelViewModel + FloatingPanel + ChatView

Hotkey-summoned panel host + the chat surface.

**Files:**

- Create: `Sources/GotItUI/ViewModels/PanelViewModel.swift`
- Create: `Sources/GotItUI/Panel/FloatingPanel.swift`
- Create: `Sources/GotItUI/Panel/PanelHostingView.swift`
- Create: `Sources/GotItUI/Chat/ChatView.swift`
- Create: `Sources/GotItUI/Chat/MessageRow.swift`
- Create: `Sources/GotItUI/Chat/InputBar.swift`
- Create: `Tests/GotItUITests/PanelViewModelTests.swift`

- [ ] **Step 14.1: Failing test — toggle visibility**

```swift
@Test func toggle_flips_visibility() async {
    let vm = PanelViewModel(...)
    #expect(await vm.isVisible == false)
    await vm.toggle()
    #expect(await vm.isVisible == true)
}
```

- [ ] **Step 14.2: Implement `FloatingPanel`**

`NSPanel` subclass with `styleMask: [.nonactivatingPanel, .hudWindow, .titled, .closable]`, `level: .floating`, `collectionBehavior: [.canJoinAllSpaces, .fullScreenAuxiliary]`, `isMovableByWindowBackground = true`.

```swift
public final class FloatingPanel: NSPanel {
    public init(rootView: some View) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 560),
            styleMask: [.nonactivatingPanel, .hudWindow, .titled, .closable],
            backing: .buffered, defer: false
        )
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.contentViewController = NSHostingController(rootView: rootView)
        self.center()
        self.isReleasedWhenClosed = false
    }
    public override var canBecomeKey: Bool { true }
}
```

- [ ] **Step 14.3: Implement `ChatView`, `MessageRow`, `InputBar`**

`InputBar` is the row from spec §10.2: `[text field] [📎 attach]  ·  [Look again] [Save] [Reset]`. Mic 🎤 / Listen 👂 absent. Buttons disabled when `vm.banner == .offline` or when `vm.canSave == false`.

- [ ] **Step 14.4: InputBarModel state tests**

Use plain Swift Testing assertions against `InputBarModel`/view-model state; do not add ViewInspector for Phase 1a. Assert: input bar exposes attach button; offline banner state appears when `vm.banner == .offline`; mic/listen actions are absent from the Phase 1a action list.

- [ ] **Step 14.5: Run + commit**

---

## Task 15: GotItUI — OfflineBanner + PermissionPrompt

**Files:**

- Create: `Sources/GotItUI/Common/OfflineBanner.swift`
- Create: `Sources/GotItUI/Common/PermissionPrompt.swift`

- [ ] **Step 15.1: OfflineBanner view + test**

Static banner: "Offline — actions paused. Reconnecting…". Test: when `vm.banner == .offline`, banner is rendered.

- [ ] **Step 15.2: PermissionPrompt view**

Two variants:

- Screen Recording: "Look again needs Screen Recording permission. [Open System Settings]" → `NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)`
- Vault folder: "Choose your captures folder. [Choose…]" → `NSOpenPanel(canChooseDirectories: true, canCreateDirectories: true)`.

- [ ] **Step 15.3: Commit**

---

## Task 16: GotItUI — SettingsWindow + VaultFolderPicker + HotkeyRecorder + Onboarding

**Files:**

- Create: `Sources/GotItUI/Settings/SettingsWindow.swift`
- Create: `Sources/GotItUI/Settings/VaultFolderPicker.swift`
- Create: `Sources/GotItUI/Settings/HotkeyRecorder.swift`
- Create: `Sources/GotItUI/ViewModels/SettingsViewModel.swift`
- Create: `Sources/GotItUI/Onboarding/FirstRunBackendStep.swift`
- Create: `Tests/GotItUITests/SettingsViewModelTests.swift`

- [ ] **Step 16.1: SettingsViewModel test — backend URL change persists**

```swift
@Test func updating_backend_url_writes_through_to_userDefaults_via_onChange_callback() async {
    var written: String? = nil
    let vm = SettingsViewModel(backendURL: URL(string: "http://x")!, onBackendURLChange: { written = $0.absoluteString })
    await vm.setBackendURL(URL(string: "http://y")!)
    #expect(written == "http://y")
}
```

- [ ] **Step 16.2: Implement SettingsViewModel + view**

Three settings: backend URL (text field with URL validation), vault folder (picker with current path label), hotkey recorder (`KeyboardShortcuts.Recorder(for: .openPanel)`).

- [ ] **Step 16.3: Onboarding `FirstRunBackendStep`**

One screen embedded in panel: title, description, backend URL field defaulted from `AppConfig`, "Connect" button, "Try without backend" link. On Connect: call `api.send(.device(installID:))`; on success dismiss; on failure show error inline.

- [ ] **Step 16.4: Commit**

---

## Task 17: AppDependencies — DI Root + GotItApp Wiring

The single call site for `make...Live(...)`.

**Files:**

- Modify: `apps/macos/App/GotItApp.swift`
- Modify: `apps/macos/App/AppDelegate.swift`
- Create: `apps/macos/App/AppDependencies.swift`

- [ ] **Step 17.1: Define `AppDependencies`**

```swift
import GotItInfra
import SwiftUI

@MainActor
final class AppDependencies {
    let config: AppConfig
    let api: APIClient
    let keychain: KeychainStore
    let installID: InstallIDStore
    let offline: OfflineMonitor
    let hotkey: HotkeyRegistrar
    let screenshotWatcher: ScreenshotWatcher
    let screenCapture: ScreenCaptureService
    let bookmark: SecureBookmarkStore
    let writer: MarkdownFileWriter
    let caps: DeviceCapabilities

    static func live() throws -> AppDependencies {
        let info = Bundle.main.infoDictionary ?? [:]
        let cfg = try AppConfig.load(info: info, defaults: .standard)
        let kc = KeychainStoreFactory.makeLive()
        let ids = InstallIDStoreFactory.makeLive()
        let api = APIClientFactory.makeLive(baseURL: cfg.backendURL, keychain: kc, installID: ids.getOrCreate())
        return AppDependencies(
            config: cfg, api: api, keychain: kc, installID: ids,
            offline: OfflineMonitorFactory.makeLive(baseURL: cfg.backendURL, timeout: cfg.healthProbeTimeout),
            hotkey: HotkeyRegistrarFactory.makeLive(),
            screenshotWatcher: ScreenshotWatcherFactory.makeLive(),
            screenCapture: ScreenCaptureServiceFactory.makeLive(),
            bookmark: SecureBookmarkStoreFactory.makeLive(defaults: .standard),
            writer: MarkdownFileWriterFactory.makeLive(),
            caps: DeviceCapabilitiesFactory.makeLive()
        )
    }
}
```

**Module-boundary verification:** in code review, attempt to add `import URLSessionAPIClient` (or any internal symbol) inside `GotItUI`. Compilation must fail. Record the attempt in the PR description as evidence.

- [ ] **Step 17.2: Wire `GotItApp` → panel + hotkey + screenshot watcher**

```swift
@main
struct GotItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        Settings {
            if let deps = delegate.deps {
                SettingsRoot(deps: deps)
            } else {
                Text("GotIt is starting...")
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private(set) var deps: AppDependencies?
    private var panel: FloatingPanel?
    private var panelVM: PanelViewModel?

    func applicationDidFinishLaunching(_ n: Notification) {
        NSApp.setActivationPolicy(.accessory)
        do {
            let liveDeps = try AppDependencies.live()
            deps = liveDeps
            let vm = PanelViewModel(deps: liveDeps)
            panelVM = vm
            panel = FloatingPanel(rootView: PanelRootView(vm: vm))
            liveDeps.hotkey.register(name: .openPanel) { [weak self] in
                DispatchQueue.main.async { self?.panel?.makeKeyAndOrderFront(nil) }
            }
            Task { await observeScreenshots() }
        } catch {
            // Phase 1a keeps startup failure visible without crashing the settings scene.
            Logger.app.error("Failed to start GotIt: \(String(describing: error))")
        }
    }

    private func observeScreenshots() async {
        guard let deps, let panelVM else { return }
        deps.screenshotWatcher.start()
        for await url in deps.screenshotWatcher.events {
            await panelVM.handleScreenshot(at: url)
        }
    }
}
```

- [ ] **Step 17.3: Build & run; verify hotkey opens panel**

```bash
xcodebuild build -project apps/macos/GotIt.xcodeproj -scheme GotIt
```

Then run from Xcode and press `Cmd+Shift+Space`. Expected: panel appears centered, no Dock icon.

- [ ] **Step 17.4: Commit**

```bash
git add apps/macos/App
git commit -m "feat(macos): wire AppDependencies, hotkey, panel, and screenshot watcher"
```

---

## Task 18: End-to-End Flow Plumbing — Capture, Chat, Save Round-Trips

Wire panelVM actions to APIClient endpoints and assert each spec §11.5 flow has corresponding view-model logic.

**Files:**

- Modify: `Sources/GotItUI/ViewModels/ChatViewModel.swift`
- Modify: `Sources/GotItUI/ViewModels/PanelViewModel.swift`
- Add: `Tests/GotItUITests/EndToEndFlowTests.swift`

- [ ] **Step 18.1: Failing tests — one per smoke flow**

For each flow in §11.5 except live-permissions ones (1, 3, 4, 5, 6, 8, 9, 10, 11), write a view-model-level test that drives the VM with fake infra and asserts the right `APIClient.send` calls were issued (use a recording fake variant or count `responses` consumption).

Example for flow 8 (Save):

```swift
@Test func save_writes_markdown_locally_and_reports_result() async throws {
    let api = RecordingFakeAPIClient(responses: [
        .save: SaveDraftResponse(vault_relative_path: "GotIt!/2026-04-30-foo.md",
                                 markdown: "# Foo", save_record_id: "sr1"),
        .saveResult: EmptyResponse(),
    ])
    let dir = try makeTempDir()
    let bookmark = FakeSecureBookmarkStore(seed: dir)
    let writer = RecordingMarkdownFileWriter()
    let vm = await PanelViewModel(api: api, bookmark: bookmark, writer: writer, ...)
    await vm.save()
    #expect(writer.recordedWrites.count == 1)
    #expect(writer.recordedWrites.first?.path == "GotIt!/2026-04-30-foo.md")
    #expect(api.calls == [.save, .saveResult])
    guard case let .json(body)? = api.lastBody(for: .saveResult),
          let last = body as? SaveResultRequest else {
        Issue.record("missing saveResult request body")
        return
    }
    #expect(last.delivered == true)
}
```

- [ ] **Step 18.2: Implement minimal logic per failing test**

In each iteration: write the view-model method, run the targeted test, commit.

- [ ] **Step 18.3: Run all tests, commit**

```bash
swift test --package-path apps/macos/Packages/GotItUI
git commit -am "feat(macos): wire capture, chat, save flows through panel VM"
```

---

## Task 19: XCUITest Smoke (One Flow)

A single end-to-end UI test that opens the panel via hotkey simulation and types a message.

**Files:**

- Create: `apps/macos/GotItUITests/Phase1aSmokeTests.swift`

- [ ] **Step 19.1: Write the UI test**

```swift
import XCTest

final class Phase1aSmokeTests: XCTestCase {
    func test_hotkey_opens_panel_and_sends_text() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GOTIT_FAKE_BACKEND"] = "1"   // app picks test fakes when set
        app.launch()
        XCUIApplication().typeKey(" ", modifierFlags: [.command, .shift])
        let field = app.textFields["chatInput"]
        XCTAssert(field.waitForExistence(timeout: 2))
        field.click(); field.typeText("hello\n")
        XCTAssert(app.staticTexts["assistant.reply"].waitForExistence(timeout: 2))
    }
}
```

- [ ] **Step 19.2: Wire `GOTIT_FAKE_BACKEND` switch in `AppDependencies`**

If env var is set, `AppDependencies.live()` uses test fakes with seeded responses — only honored in DEBUG builds.

- [ ] **Step 19.3: Run + commit**

```bash
xcodebuild test -project apps/macos/GotIt.xcodeproj -scheme GotIt -destination 'platform=macOS' -only-testing:GotItUITests
git commit -am "test(macos): xcuitest smoke for hotkey + chat round-trip"
```

---

## Task 20: Husky Wiring + pnpm Pipeline

**Files:**

- Modify: `.husky/pre-push`
- Modify: root `package.json`

- [ ] **Step 20.1: Add gated `test:macos` to pre-push**

Edit `.husky/pre-push` to run `pnpm test:macos` only when `apps/macos/` has changes since the last commit:

```bash
if git diff --name-only HEAD~1 HEAD | grep -q '^apps/macos/'; then
  pnpm test:macos
fi
```

(Wrap so an initial commit edge case doesn't fail; use `git diff --name-only @{u}.. 2>/dev/null || git ls-files apps/macos`.)

- [ ] **Step 20.2: Run a no-op push attempt to verify hook fires**

```bash
git commit --allow-empty -m "chore: verify husky" && git push --dry-run
```

(Expected: pre-push runs typecheck/lint/test/purity; macOS test only runs if the branch touched `apps/macos/`.)

- [ ] **Step 20.3: Commit**

```bash
git add .husky package.json
git commit -m "chore: gate pnpm test:macos behind apps/macos diff in pre-push"
```

---

## Task 21: Manual Smoke Checklist Execution + Implementor Evidence

**Action only — no new code.** Implementor performs spec §11.5 flows on a physical Mac and records results.

- [ ] **21.1** Cmd+Shift+3 → toast appears → Cancel cancels; let it through → image arrives in chat as `screen_capture` message.
- [ ] **21.2** Cmd+Shift+Space → panel opens.
- [ ] **21.3** Drag image onto panel → capture flow runs.
- [ ] **21.4** ⌘V image → capture flow runs.
- [ ] **21.5** 📎 attach → file picker → image sent.
- [ ] **21.6** Type "hello" → Enter → assistant reply renders.
- [ ] **21.7** Click "Look again" first time → permission prompt → grant → relaunch → second click captures real screen and renders vision result.
- [ ] **21.8** Click Save → folder picker → choose → file appears in folder → toast click opens file in Obsidian (or Finder fallback).
- [ ] **21.9** Click Reset → empty panel; backend retains old session.
- [ ] **21.10** Stop backend → next action → banner appears, write buttons disable. Restart → next action succeeds, banner clears.
- [ ] **21.11** (Developer-only) delete device row from backend DB → next action → silent re-pair → success.

For each step, record evidence: short screen recording or commit-time note. Place evidence under `docs/evidence/f001-phase-1a-macos-client/` (do not commit large videos — link to a private location and reference paths in the validator hand-off).

- [ ] **Step 21.12: Commit evidence index**

```bash
git add docs/evidence/f001-phase-1a-macos-client/
git commit -m "docs: f001 phase 1a manual smoke evidence index"
```

---

## Task 21b: Parent-Spec Amendments (spec §10.2)

Per spec §10.2, six in-place edits must be applied to `docs/specs/f001-screen-capture-mvp.md` before the validator sign-off. These are implementor-owned changes, not validator side-effects.

**Files:**

- Modify: `docs/specs/f001-screen-capture-mvp.md`

- [ ] **Step 21b.1: Apply §5 trigger amendments**

In `docs/specs/f001-screen-capture-mvp.md §5 (Triggers)`: add "hotkey opens floating panel" as a first-class trigger alongside screenshot detection.

- [ ] **Step 21b.2: Apply §6.2 layout amendments**

In `§6.2 (Panel layout)`: add the `InputBar` row description (`[text field] [📎 attach] · [Look again] [Save] [Reset]`) and note Phase 1b items (mic, listen) are absent.

- [ ] **Step 21b.3: Apply §9 rename**

In `§9`: apply any terminology rename identified in the sub-spec (verify against `docs/specs/f001-phase-1a-macos-client.md §10.2` for the exact rename).

- [ ] **Step 21b.4: Apply §11 endpoint addition**

In `§11 (API surface)`: add `POST /save/:id/result` endpoint with request/response shape.

- [ ] **Step 21b.5: Apply §13.2 config note**

In `§13.2`: add note referencing `AppConfig` and the `GOTIT_API_BASE_URL` + `GOTIT_CAPTURE_FOLDER` env vars added in Phase 1a.

- [ ] **Step 21b.6: Apply §16.1 sprint contract update**

In `§16.1 (Sprint contract)`: add Phase 1a sprint contract entry referencing this plan.

- [ ] **Step 21b.7: Commit**

```bash
git add docs/specs/f001-screen-capture-mvp.md
git commit -m "docs: apply f001 phase-1a parent-spec amendments per sub-spec §10.2"
```

---

## Task 22: Final Validation Hand-off

- [ ] **22.1** All plan checkboxes ticked. Run a final pass:

```bash
grep -n '\- \[ \]' docs/plans/f001-phase-1a-macos-client.md || echo "ALL TICKED"
```

Expected: `ALL TICKED`. Any remaining `- [ ]` blocks the validator (per `CLAUDE.md` Checkbox Discipline).

- [ ] **22.2** Run full pipelines:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check && pnpm test:macos
swiftformat --lint apps/macos/
```

Expected: all green.

- [ ] **22.3** Verify **F013 Obsidian Plugin Delivery** is already listed as a Planned feature in `BOARD.md`, ahead of F002 and after F001, per spec §10.1. If missing, add it before the validator hand-off. Commit only if changed:

```bash
git add BOARD.md
git commit -m "docs: add F013 Obsidian Plugin Delivery to BOARD.md ahead of F002"
```

- [ ] **22.4** Open a clean session and dispatch the validator agent against:
  - `BOARD.md` after the F013 check above
  - `docs/specs/f001-phase-1a-macos-client.md`
  - this plan file (with all boxes ticked)
  - the implemented code under `apps/macos/` and `packages/api/`
  - the evidence index from Task 21

  The validator scores per `CLAUDE.md` quality pipeline. ≥7/10 → STATUS.md update; <7/10 → fix and re-submit.

- [ ] **22.5** On PASS: validator updates `STATUS.md` and marks F001 Phase 1a complete.

---

## Self-Review Checklist (run before Task 1)

1. **Spec coverage:** Walk through sub-spec sections 2, 4, 6, 7, 8, 9, 10, 11.5, 12. Each requirement maps to a task above. Backend amendments from §10.2 → Task 1. Module structure §4.2 → Tasks 2–17. AppConfig §6 → Task 4. Permissions §7 → Task 12 + Task 15. Hotkey/Screenshot/Save §8 → Tasks 8, 10, 11. API/Auth §9 → Task 6. Parent-spec amendments §10.2 → Task 21b. BOARD.md F013 → Task 21b/22.4 pre-validation check. §11.5 flows → Tasks 18, 19, 21. Sprint contract §12 → Tasks 20, 22. Test helpers → Task 5b.
2. **Placeholder scan:** No `TBD` / `implement later`. Code blocks present in every code step. Test step has the test code; implementation step has the implementation.
3. **Type consistency:** `MarkdownFileWriter` (not `VaultWriter`) used everywhere. `resolveCollision(existing:candidate:)` signature stable across Tasks 8, 18. `Endpoint<Response>` typed factories and `EndpointID` defined in Task 6 and reused in Tasks 13, 18. `SaveDraftResponse` field names (`vault_relative_path`, `markdown`, `save_record_id`) match `packages/shared/src/api.ts`.

---

Plan complete. Saved to `docs/plans/f001-phase-1a-macos-client.md`.
