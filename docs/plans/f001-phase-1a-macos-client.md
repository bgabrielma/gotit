# F001 Phase 1a — macOS Client (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the macOS-native imperative shell for the smallest end-to-end vertical of F001 Phase 1a — native screenshot routing, hotkey-summoned floating panel, round-trip text chat, on-demand recapture, and direct Markdown save to a user-chosen vault folder. End state: `xcodebuild test -scheme GotIt -destination "platform=macOS"` passes; manual smoke checklist (spec §11.5) green; `pnpm test:macos` from the repo root works; Husky pre-push gates Swift tests when `apps/macos/` changes.

**Architecture:** Functional Core / Imperative Shell on the Swift side. Three local SPM packages with compiler-enforced module boundaries: `GotItModels` (pure DTOs), `GotItInfra` (protocol-fronted I/O wrappers with `makeLive` / `makeNull` factories — James Shore Nullable pattern), `GotItUI` (SwiftUI views and view models that consume only models + infra protocols). The app target is the DI root and sole call site for `make…Live(…)` factories. No mocking framework. Pure helpers (only one in 1a — `resolveCollision`) live as `internal` free functions next to consumers. Backend amendments required by spec §10.2 are part of Task 1 of this plan so the client has a contract to consume.

**Tech Stack:** Swift 5.10+, Xcode 16+ (Swift Testing requirement, spec §12), macOS 13 Ventura+ deployment target, SwiftUI + AppKit (`NSPanel`, `NSStatusItem`, `NSMetadataQuery`, `NSWorkspace`, `NSOpenPanel`), `ScreenCaptureKit`, `Security` (Keychain), `CryptoKit`, `KeyboardShortcuts` SPM dependency (sindresorhus, MIT), `URLSession` for HTTP, Swift Testing (`@Test`) for unit tests, XCTest for the XCUITest smoke target. TypeScript side: small backend amendments to `packages/api` and `packages/shared` to align the `/save` contract with spec §8.3 / §11.

---

## Spec References

This plan implements the client portion of:

- **Sub-spec:** `docs/specs/f001-phase-1a-macos-client.md`
- **Parent spec:** `docs/specs/f001-screen-capture-mvp.md`
- **Backend plan (completed):** `docs/plans/f001-phase-1a-backend.md`
- **Sprint contract:** sub-spec §12 + parent spec §16.1
- **Architecture rules:** `CLAUDE.md` (FC/IS, no mocks in core, strict TS, terminology lint)

Phases 1b (mic), 1c (Listen), 1d (history) are **out of scope**.

### Note on backend drift (validator: accept)

The current `packages/api` differs from the spec for `/save` because of post-validation improvements:

- Backend `POST /save` currently writes the file server-side and returns `{ vault_path, save_record_id }`.
- Spec §8.3 + §11 require backend to return `{ vault_relative_path, markdown, save_record_id }` and **never** touch the filesystem; the client owns the write.
- `SaveDraftResponseSchema` is already defined and tested in `packages/shared` but currently unused.

**Validator instruction:** treat this drift as **accepted, will-be-fixed** during this plan. Pre-implementation validation must not block on the spec-vs-code mismatch in `/save`; Task 1 below is the explicit reconciliation step. Post-implementation validation, however, MUST verify Task 1 actually landed (route returns the draft shape; backend filesystem call removed) before scoring Spec Conformance.

Other backend drift (Postgres storage refactor F014, OpenAI/local connector seams, `fromBackend(...)` factory pattern) is unrelated to this plan and is left untouched — also accepted.

### Pre-implementation amendments (gaps found in plan review, 2026-05-01)

These items were missing from the plan as written. Implementors must address each one; the validator will check all six.

**A. `AppConfig` missing two config keys (spec §6).**
`GotItAutoDetectScreenshots` (bool, default `true`) and `GotItScreenshotGraceSeconds` (int, default `3`) are in the spec config table but absent from `AppConfig.swift` in Task 20. Add both keys to `AppConfig.load()`. Task 23's `handleScreenshot(at:graceSeconds:)` must read `graceSeconds` from `AppConfig` (passed in by `AppDelegate`) instead of the hardcoded `3`.

**B. First-run detection and `POST /device` not wired in `AppDelegate` (spec §7.1).**
`FirstRunBackendStep.swift` is created in Task 19 but `AppDelegate` (Task 20) contains no first-run logic. Add to `applicationDidFinishLaunching`: check whether a device token already exists in Keychain; if not, show `FirstRunBackendStep` inside the panel instead of `PanelHostingView`. The "Connect" callback must call `POST /device { install_id }`, store the returned token via `KeychainStore`, then swap the panel to `PanelHostingView`. On failure, surface the error and allow retry. "Try without backend" should skip the POST and open in offline mode.

**C. Vault folder inline picker not wired (spec §7.2, §8.3).**
`PanelHostingView` (Task 18) renders a "Choose…" `PermissionPrompt` for `.permissionRequired(.vaultFolder)` but marks its action `/* wired by app */`. Add the wiring — either in `AppDelegate.installPanel()` (pass a closure into the view) or directly in `PanelHostingView` — so the CTA calls `VaultFolderPicker.choose()` and, on success, calls `deps.bookmark.save(folder: url)`. Task 15's `save()` re-runs from the panel's "Save" button after the folder is stored; that retry must be triggered (or the user can press Save again).

**D. `didChangeScreenParametersNotification` reprobe missing (spec §7.3).**
`AppDelegate` (Task 20) registers `didBecomeActiveNotification` but omits `NSApplication.didChangeScreenParametersNotification`. Add the observer alongside the existing one: `Task { await self?.deps.capabilities.reprobe() }`.

**E. `recheck()` before writes (spec §9.3).**
Spec §9.3 requires `OfflineMonitor.recheck()` (cheap `GET /health`) to run before any write attempt. `PanelViewModel.save()` and `sendCapture()` (Task 15) read the cached `isOnline` property without calling `recheck()` first. Add `await monitor.recheck()` at the top of both methods (before the `isOnline` guard); update `OfflineMonitor.recheck()` to also flip `isOnline` and surface `APIError.offline` on failure. Adjust `OfflineStateTests` to assert `recheck()` is called.

**F. Save toast must try `obsidian://open` first, Finder as fallback (spec §8.3).**
`PanelHostingView` (Task 18, `.savedTo` case) always calls `NSWorkspace.activateFileViewerSelecting:`. Change the tap action to first attempt `NSWorkspace.shared.open(URL(string: "obsidian://open?path=\(encodedPath)")!)` and fall back to `activateFileViewerSelecting:` only if the Obsidian URL fails to open (check `NSWorkspace.open(_:)` return value or catch).

---

### Design notes (clarifications captured during plan review)

**`POST /save/:id/result` is dropped from Phase 1a.** Earlier drafts framed it as "best-effort backend reporting" feeding the future history tab (Phase 1d, out of scope) and the F013 plugin-delivery state machine. Phase 1a never reads delivery status, so cutting the route, the `SaveResultRequest` schema, and the client fire-and-forget block removes pure carrying cost. Move it to F013's prep when that feature opens. Spec §10.2's amendment list is reduced accordingly: only the `/save` draft contract change is needed now.

**Save flow, end-to-end:**

1. First Save click → if no vault bookmark stored, `NSOpenPanel` asks the user to pick a folder. Folder URL is converted to a security-scoped bookmark and stored in `UserDefaults` under `GotItVaultBookmark`.
2. `POST /save` returns `{ vault_relative_path, markdown, save_record_id }`. Backend produced the content (LLM + template + slug). It does **not** touch any filesystem.
3. Client resolves the bookmark to a live folder URL, joins `vault_relative_path` (e.g. `GotIt!/2026-05-01-1542-stripe-docs.md`), runs `resolveCollision` against the folder's existing entries, atomic-writes via `MarkdownFileWriter`.
4. Toast shows `Saved to <filename>` with click → `obsidian://open?path=…`; Finder reveal as fallback.

The split exists because the backend has no business reaching the user's filesystem (it might run remotely; even locally the bookmark lives in the app, not the API process), and the client has no business rendering the markdown (LLM lives server-side).

---

## File Structure

```
got-it/
├── packages/api/
│   ├── src/routes/save.ts                              (modify — return draft, drop fs write)
│   └── src/__tests__/integration/routes/
│       └── save.test.ts                                 (modify — assert draft response, no fs side effect)
├── packages/shared/
│   └── src/api.ts                                       (modify — remove legacy SaveResponseSchema from save route)
│
├── apps/macos/                                          (greenfield — currently empty)
│   ├── GotIt.xcodeproj/                                 (create — thin app target, signing, entitlements)
│   ├── App/
│   │   ├── GotItApp.swift                               (create — @main, NSApplicationDelegate)
│   │   ├── AppDelegate.swift                            (create — status item, lifecycle, panel host)
│   │   ├── AppDependencies.swift                        (create — DI root, single call site for live factories)
│   │   ├── AppConfig.swift                              (create — validated config struct)
│   │   ├── Info.plist                                   (create — LSUIElement=true, usage strings)
│   │   └── GotIt.entitlements                           (create — App Sandbox off for Phase 1a — see Task 2)
│   ├── Packages/
│   │   ├── GotItModels/
│   │   │   ├── Package.swift                            (create — no deps)
│   │   │   ├── Sources/GotItModels/
│   │   │   │   ├── Session.swift                        (create)
│   │   │   │   ├── Message.swift                        (create — sum type via enum w/ associated values)
│   │   │   │   ├── AnalysisResult.swift                 (create)
│   │   │   │   ├── APIRequests.swift                    (create — CaptureRequest, ChatRequest, SaveRequest, etc.)
│   │   │   │   ├── APIResponses.swift                   (create — CaptureResponse, ChatResponse, SaveDraftResponse, etc.)
│   │   │   │   └── DeviceRegistration.swift             (create)
│   │   │   └── Tests/GotItModelsTests/
│   │   │       ├── MessageCodableTests.swift            (create)
│   │   │       ├── AnalysisResultCodableTests.swift     (create)
│   │   │       └── APIShapesTests.swift                 (create — round-trip against fixtures)
│   │   ├── GotItInfra/
│   │   │   ├── Package.swift                            (create — depends on GotItModels + KeyboardShortcuts SPM)
│   │   │   ├── Sources/GotItInfra/
│   │   │   │   ├── API/
│   │   │   │   │   ├── APIClient.swift                  (create — protocol)
│   │   │   │   │   ├── Endpoint.swift                   (create — typed route enum)
│   │   │   │   │   ├── APIError.swift                   (create)
│   │   │   │   │   ├── URLSessionAPIClient.swift        (create — internal live)
│   │   │   │   │   ├── NullAPIClient.swift              (create — internal null)
│   │   │   │   │   └── APIClientFactory.swift           (create — public static makeLive/makeNull)
│   │   │   │   ├── Capture/
│   │   │   │   │   ├── ScreenCaptureService.swift       (create — protocol + factory)
│   │   │   │   │   ├── ScreenCaptureKitService.swift    (create — internal live)
│   │   │   │   │   └── NullScreenCaptureService.swift   (create — internal null)
│   │   │   │   ├── Screenshot/
│   │   │   │   │   ├── ScreenshotWatcher.swift          (create — protocol + factory)
│   │   │   │   │   ├── MetadataQueryScreenshotWatcher.swift (create — internal live)
│   │   │   │   │   └── NullScreenshotWatcher.swift      (create — internal null)
│   │   │   │   ├── Hotkey/
│   │   │   │   │   ├── HotkeyRegistrar.swift            (create — protocol + factory)
│   │   │   │   │   ├── KeyboardShortcutsRegistrar.swift (create — internal live)
│   │   │   │   │   └── NullHotkeyRegistrar.swift        (create — internal null)
│   │   │   │   ├── Files/
│   │   │   │   │   ├── MarkdownFileWriter.swift         (create — protocol + factory)
│   │   │   │   │   ├── FileManagerMarkdownWriter.swift  (create — internal live)
│   │   │   │   │   ├── NullMarkdownFileWriter.swift     (create — internal null)
│   │   │   │   │   └── ResolveCollision.swift           (create — pure free fn)
│   │   │   │   ├── Bookmarks/
│   │   │   │   │   ├── SecureBookmarkStore.swift        (create — protocol + factory)
│   │   │   │   │   ├── UserDefaultsBookmarkStore.swift  (create — internal live)
│   │   │   │   │   └── NullBookmarkStore.swift          (create — internal null)
│   │   │   │   ├── Keychain/
│   │   │   │   │   ├── KeychainStore.swift              (create — protocol + factory)
│   │   │   │   │   ├── SecKeychainStore.swift           (create — internal live)
│   │   │   │   │   ├── NullKeychainStore.swift          (create — internal null)
│   │   │   │   │   └── InstallIDStore.swift             (create — UserDefaults-backed UUID)
│   │   │   │   ├── Permissions/
│   │   │   │   │   └── DeviceCapabilities.swift         (create — observable struct + reprobe)
│   │   │   │   ├── Network/
│   │   │   │   │   ├── OfflineMonitor.swift             (create — protocol + factory)
│   │   │   │   │   ├── HealthProbeOfflineMonitor.swift  (create — internal live)
│   │   │   │   │   └── NullOfflineMonitor.swift         (create — internal null)
│   │   │   │   └── Logging/
│   │   │   │       └── Logger.swift                     (create — os.Logger wrapper)
│   │   │   └── Tests/GotItInfraTests/
│   │   │       ├── ResolveCollisionTests.swift          (create — pure helper)
│   │   │       ├── APIClientNullTests.swift             (create — null-driven endpoint tests)
│   │   │       ├── APIClient401Tests.swift              (create — re-pair flow)
│   │   │       ├── APIClientRetryTests.swift            (create — backoff)
│   │   │       ├── KeychainStoreLiveTests.swift         (create — uses real Keychain w/ unique service id)
│   │   │       ├── MarkdownFileWriterLiveTests.swift    (create — tmp dir)
│   │   │       ├── SecureBookmarkStoreLiveTests.swift   (create — tmp dir)
│   │   │       ├── OfflineMonitorTests.swift            (create — null-driven)
│   │   │       └── DeviceCapabilitiesTests.swift        (create)
│   │   └── GotItUI/
│   │       ├── Package.swift                            (create — depends on GotItModels + GotItInfra)
│   │       ├── Sources/GotItUI/
│   │       │   ├── Panel/
│   │       │   │   ├── FloatingPanel.swift              (create — NSPanel subclass)
│   │       │   │   └── PanelHostingView.swift           (create — SwiftUI host)
│   │       │   ├── Chat/
│   │       │   │   ├── ChatView.swift                   (create)
│   │       │   │   ├── MessageRow.swift                 (create)
│   │       │   │   └── InputBar.swift                   (create)
│   │       │   ├── Settings/
│   │       │   │   ├── SettingsWindow.swift             (create)
│   │       │   │   ├── VaultFolderPicker.swift          (create)
│   │       │   │   └── HotkeyRecorder.swift             (create — wraps KeyboardShortcuts.Recorder)
│   │       │   ├── Onboarding/
│   │       │   │   └── FirstRunBackendStep.swift        (create)
│   │       │   ├── Common/
│   │       │   │   ├── OfflineBanner.swift              (create)
│   │       │   │   ├── PermissionPrompt.swift           (create)
│   │       │   │   └── ToastView.swift                  (create)
│   │       │   └── ViewModels/
│   │       │       ├── PanelViewModel.swift             (create — root state)
│   │       │       ├── ChatViewModel.swift              (create — message list, send)
│   │       │       ├── SettingsViewModel.swift          (create)
│   │       │       └── PanelEvents.swift                (create — toast/permission/error sum type)
│   │       └── Tests/GotItUITests/
│   │           ├── PanelViewModelTests.swift            (create)
│   │           ├── ChatViewModelTests.swift             (create)
│   │           ├── ChatViewModel401Tests.swift          (create — re-pair UI gating)
│   │           ├── OfflineStateTests.swift              (create)
│   │           └── SaveFlowTests.swift                  (create — Save end-to-end with null infra + tmp dir)
│   └── GotItUITests/
│       └── PanelSmokeTests.swift                        (create — XCUITest, one happy path)
│
├── package.json                                          (modify — add `test:macos` script)
├── .husky/pre-push                                       (modify — invoke macOS tests when apps/macos changed)
└── docs/plans/f001-phase-1a-macos-client.md             (this file)
```

**Boundaries:**

- `GotItModels` exports DTOs only. No imports beyond `Foundation`.
- `GotItInfra` exports `public` protocols + factory enums. All concrete classes are `internal`. The compiler enforces that `GotItUI` cannot reference a concrete `URLSessionAPIClient`.
- `GotItUI` consumes only `GotItModels` types and `GotItInfra` protocols.
- `apps/macos/App/AppDependencies.swift` is the **single** call site for `make…Live(…)` factories.
- `apps/macos/App/AppConfig.swift` is the **single** boundary for `UserDefaults` and `Bundle.main` reads outside of infra wrappers' own internal storage.

---

## Parallelization Plan

This project is being executed by Codex agents that can fan out subagents. The waves below are the maximum-parallel decomposition; tasks within a wave have **no shared state and no sequential dependency** and can run as concurrent subagents using `superpowers:dispatching-parallel-agents`. Run waves sequentially; checkpoint after each wave (run the full SPM test suite + `xcodebuild build` so a regression in one branch is caught before the next wave starts).

```
Wave 0  Task 1 (backend amendment)        ──┐
                                             ├── independent of macOS until app wiring (Task 20)
Wave 1  Task 2 (Xcode workspace)          ──┘
Wave 2  Task 3 (GotItModels)
Wave 3  Tasks 4, 6, 7, 8, 9, 10, 11, 12   ── 8-way fan-out (all infra wrappers w/ no inter-dep)
Wave 4  Tasks 5, 13                        ── 5 needs 4+6; 13 needs 8
Wave 5  Tasks 14, 16                        ── 14 needs 5+9; 16 needs 8
Wave 6  Task 15                              ── needs 5,7,8,9,11,14
Wave 7  Tasks 17, 19                         ── views; 17 needs 14+15, 19 needs 16
Wave 8  Task 18                              ── FloatingPanel/PanelHostingView; needs 17
Wave 9  Task 20                              ── DI root + AppDelegate; needs everything above + Task 1's contract
Wave 10 Tasks 21, 22, 23, 24                 ── 4-way fan-out; all need Task 20 baseline
Wave 11 Task 25                              ── final validation gate
```

**Wave 0 + Wave 1 in parallel.** Task 1 (backend, TS) and Task 2 (Xcode workspace, no Swift code yet) touch disjoint paths and can run as two concurrent subagents from the start.

**Wave 3 is the biggest win.** Eight infra wrappers (`Endpoint`/`APIClient`/`Null`, `Keychain`, `MarkdownFileWriter`+`resolveCollision`, `SecureBookmarkStore`, `OfflineMonitor`, `ScreenshotWatcher`, `ScreenCaptureService`, `HotkeyRegistrar`) all depend only on `GotItModels`. Each is a self-contained protocol + factory + live + null + tests, ~150–250 LOC. Spawn 8 subagents in parallel; each runs its TDD loop; checkpoint by running `swift test --package-path apps/macos/Packages/GotItInfra` once all eight return.

**Wave 10** (`pnpm test:macos` script + Husky, drag/paste/attach UI, screenshot grace, XCUITest smoke) is independent across the four tasks — fan out.

**What is NOT parallelizable:** anything that mutates `Package.swift`, `AppDependencies`, `AppDelegate`, or `app.ts` should be done by a single agent in its wave. Two concurrent agents editing `AppDependencies.swift` in Wave 9 will conflict; that's why Wave 9 is a single task.

**Codex orchestration tip:** when fanning a wave, give each subagent its own task block (e.g. "Task 7 only") and remind it not to touch files outside that task's File Structure list. The plan's per-task File Structure is the merge boundary.

---

## Tasks

> **TDD discipline:** every code-producing task has a failing test first, run-to-fail, minimal impl, run-to-pass, commit. Pure helpers (`ResolveCollision`) follow the same rule with real inputs and no doubles. Live infra wrappers are smoke-tested against real macOS APIs where automation is reliable (Keychain with a unique service prefix, FileManager + tmp dir, SecureBookmark + tmp dir). `ScreenCaptureKit`, `NSMetadataQuery` mounting, and global hotkey registration are exercised by manual smoke (spec §11.5) — automation is unreliable and would require permissions in CI. View models are tested against null infra. Skip TDD only for pure config (Package.swift, Info.plist, entitlements).

> **Commit cadence:** one commit per step group (test+impl+verify) where natural; bigger refactors get their own commit. Conventional Commits format. Scope `feat(macos)` / `feat(infra)` / `feat(ui)` / `feat(api)` etc.

---

## Task 1 — Backend Amendment: `/save` returns draft (no server-side write)

**Why:** Sub-spec §10.2 calls for a backend amendment so the client owns the markdown write. Doing it first means subsequent Swift work has a real contract to consume. `/save/:id/result` is intentionally **not** in this task — see Design Notes above.

**Files:**

- Modify: `packages/shared/src/api.ts` (drop `SaveResponseSchema`, keep `SaveDraftResponseSchema`)
- Modify: `packages/shared/src/schemas.test.ts`
- Modify: `packages/api/src/routes/save.ts`
- Modify: `packages/api/src/__tests__/integration/routes/save.test.ts`

- [ ] **Step 1.1: Drop `SaveResponseSchema` from `packages/shared/src/api.ts`**

`SaveDraftResponseSchema` already exists and is what the route should return. Remove the legacy `SaveResponseSchema` / `SaveResponse` exports. Any importer switches to `SaveDraftResponse`.

- [ ] **Step 1.2: Update `packages/shared/src/schemas.test.ts`**

Drop the `SaveResponseSchema` round-trip test if present. The existing `SaveDraftResponseSchema` test stays. Run `pnpm --filter @got-it/shared test`; expect PASS.

- [ ] **Step 1.3: Failing integration test for new save behaviour**

In `packages/api/src/__tests__/integration/routes/save.test.ts`, replace the prior assertion block. The test must:

```typescript
it('returns vault_relative_path + markdown without touching disk', async () => {
  const writes: string[] = []
  const obsidianWriter = ObsidianWriter.fromBackend({
    write: async ({ relativePath }) => {
      writes.push(relativePath)
      return { fullPath: '/should/not/be/used' }
    },
  })
  const app = createApp({ ...baseDeps, obsidianWriter })
  // …seed device + active session + a screen_capture + assistant message…
  const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
  expect(res.status).toBe(201)
  expect(res.body.vault_relative_path).toMatch(/^GotIt!\/\d{4}-\d{2}-\d{2}-/)
  expect(res.body.markdown).toContain('# ')
  expect(res.body.save_record_id).toBeTruthy()
  expect(writes).toEqual([]) // backend MUST NOT write
})
```

Run: `pnpm --filter @got-it/api test -- save.test.ts`. Expect: FAIL (current handler still writes + returns `vault_path`).

- [ ] **Step 1.4: Rewrite `packages/api/src/routes/save.ts`**

```typescript
import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { SaveRequestSchema, SaveDraftResponseSchema } from '@got-it/shared'
import { formatObsidianEntry, resolveSaveFormat, slugifySummary } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function saveRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = SaveRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message })

    const device = req.device!
    const session = await deps.store.getActiveSession(device.id)
    if (!session) return res.status(409).json({ error: 'no active session' })

    const tail = await deps.store.listMessages({ session_id: session.id, limit: 50 })
    const lastCapture = [...tail].reverse().find((m) => m.kind === 'screen_capture')
    if (!lastCapture || lastCapture.kind !== 'screen_capture') {
      return res.status(422).json({ error: 'active session has no screen capture to save' })
    }
    const lastAssistant = [...tail].reverse().find((m) => m.kind === 'assistant')

    const plan = resolveSaveFormat(parsed.data.instruction)
    let body: string
    if (plan.template === 'default') {
      body = lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : ''
    } else {
      try {
        body = await deps.chatAI.complete({
          system: deps.chatPersonaPrompt,
          messages: [
            {
              role: 'user',
              content:
                `Render the following content per this instruction. Return ONLY the body markdown.\n\n` +
                `Instruction: ${plan.instruction}\n\n` +
                `Summary: ${lastCapture.analysis.summary}\n\n` +
                `Notes: ${lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : '(none)'}`,
            },
          ],
        })
      } catch (e) {
        return res.status(502).json({ error: e instanceof Error ? e.message : 'chat failure' })
      }
    }

    const title = lastCapture.analysis.summary.split('\n')[0] ?? 'Untitled'
    const savedAt = new Date()
    const slug = slugifySummary(title)
    const stamp = savedAt.toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const filename = `${stamp}-${slug}-${uuid().slice(0, 8)}.md`
    const captureFolder = deps.captureFolder.replace(/^\/+|\/+$/g, '') || 'GotIt!'
    const relativePath = `${captureFolder}/${filename}`

    const markdown = formatObsidianEntry({
      template: plan.template,
      analysis: lastCapture.analysis,
      body,
      sessionId: session.id,
      savedAt,
      title,
    })

    const record: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'save_record',
      vault_path: relativePath, // stored as the relative draft path; client writes the file
      ...(plan.instruction ? { instruction: plan.instruction } : {}),
      created_at: new Date().toISOString(),
    }
    await deps.store.appendMessage(record)

    const response = SaveDraftResponseSchema.parse({
      vault_relative_path: relativePath,
      markdown,
      save_record_id: record.id,
    })
    res.status(201).json(response)
  })

  return r
}
```

`obsidianWriter` is no longer used by this route. Leave the dep on `AppDeps` for now — Step 1.5 prunes it.

Run the test from Step 1.3. Expect: PASS.

- [ ] **Step 1.5: Prune unused `obsidianWriter`**

If no other route consumes `obsidianWriter`, remove it from `AppDeps`, the live wiring in `server.ts`, the `ObsidianWriter` infra wrapper file, and `obsidian-writer.test.ts`. If any other route still uses it, leave it. Run `pnpm --filter @got-it/api typecheck` and the full `pnpm --filter @got-it/api test` after pruning.

- [ ] **Step 1.6: Run full TS validation**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check
```

Expect: all green.

- [ ] **Step 1.7: Commit**

```bash
git add packages/shared packages/api
git commit -m "feat(api): align /save with spec (return draft body, drop server-side write)"
```

---

## Task 2 — Xcode workspace, three SPM packages, dependency edges

**Files:**

- Create: `apps/macos/GotIt.xcodeproj` (Xcode-generated)
- Create: `apps/macos/Packages/GotItModels/Package.swift`
- Create: `apps/macos/Packages/GotItInfra/Package.swift`
- Create: `apps/macos/Packages/GotItUI/Package.swift`
- Create: `apps/macos/App/Info.plist`
- Create: `apps/macos/App/GotIt.entitlements`

- [ ] **Step 2.1: Verify Xcode 16+ is installed**

```bash
xcodebuild -version
```

Expect: `Xcode 16.x` or higher (Swift Testing requirement, sub-spec §12).

- [ ] **Step 2.2: Create the empty Xcode project**

Open Xcode → File → New → Project → macOS → App. Fields:

- Product Name: `GotIt`
- Team: Personal Team (free Apple ID)
- Organization Identifier: `dev.gotit`
- Bundle Identifier: `dev.gotit.GotIt`
- Interface: SwiftUI
- Language: Swift
- Storage: None (no Core Data)
- Include Tests: yes (this creates `GotItUITests` target — keep it; rename target to `GotItUITests` if Xcode created `GotItTests`)

Save in `apps/macos/`. Move the generated `GotIt/` source folder to `apps/macos/App/` and update the project's group reference. Delete the auto-generated `ContentView.swift` and `GotItApp.swift` — Task 24 creates them deliberately.

- [ ] **Step 2.3: Create `apps/macos/Packages/GotItModels/Package.swift`**

```swift
// swift-tools-version:5.10
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

Add empty `Sources/GotItModels/.gitkeep` and `Tests/GotItModelsTests/.gitkeep` so SPM resolves.

- [ ] **Step 2.4: Create `apps/macos/Packages/GotItInfra/Package.swift`**

```swift
// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "GotItInfra",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItInfra", targets: ["GotItInfra"]),
    ],
    dependencies: [
        .package(path: "../GotItModels"),
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.2.0"),
    ],
    targets: [
        .target(
            name: "GotItInfra",
            dependencies: [
                "GotItModels",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ]
        ),
        .testTarget(
            name: "GotItInfraTests",
            dependencies: ["GotItInfra"]
        ),
    ]
)
```

- [ ] **Step 2.5: Create `apps/macos/Packages/GotItUI/Package.swift`**

```swift
// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "GotItUI",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItUI", targets: ["GotItUI"]),
    ],
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

- [ ] **Step 2.6: Add the three local packages as `GotIt` app target dependencies**

In Xcode: select the `GotIt` app target → Frameworks, Libraries, and Embedded Content → `+` → Add Files… → pick each of the three `Package.swift` files. Mark all three as **Embed & Sign**. Confirm `GotItUI` appears in the dropdown.

- [ ] **Step 2.7: Configure `Info.plist` for menu-bar-only**

`apps/macos/App/Info.plist` (start from the auto-generated one):

```xml
<key>LSUIElement</key><true/>
<key>NSScreenCaptureUsageDescription</key>
<string>GotIt! re-captures your active display when you click "Look again" so the model can see what you're working on.</string>
<key>NSDesktopFolderUsageDescription</key>
<string>GotIt! reads screenshots you save with Cmd+Shift+3/4/5 so it can route them into the panel.</string>
```

(`NSScreenCaptureUsageDescription` is the modern key; some macOS versions also honour `NSCameraUsageDescription` style. Add only the screen capture key — mic is Phase 1b.)

- [ ] **Step 2.8: Configure entitlements**

`apps/macos/App/GotIt.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTD/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
</dict>
</plist>
```

App Sandbox is **off** for Phase 1a so the security-scoped bookmark + arbitrary vault folder + Keychain `kSecAttrAccessibleAfterFirstUnlock` work without entitlement gymnastics. Re-evaluate before App Store distribution (out of MVP scope).

In Xcode → Signing & Capabilities, link the entitlements file.

- [ ] **Step 2.9: Verify the workspace builds**

```bash
cd apps/macos
xcodebuild build -scheme GotIt -destination "platform=macOS" -quiet
```

Expect: `** BUILD SUCCEEDED **`. The app does nothing yet but compiles.

- [ ] **Step 2.10: Commit**

```bash
git add apps/macos
git commit -m "chore(macos): scaffold Xcode workspace + three SPM packages (Models, Infra, UI)"
```

---

## Task 3 — `GotItModels`: domain DTOs (Codable mirrors of `@got-it/shared`)

**Files:**

- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/Session.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/Message.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/AnalysisResult.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/APIRequests.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/APIResponses.swift`
- Create: `apps/macos/Packages/GotItModels/Sources/GotItModels/DeviceRegistration.swift`
- Test: `apps/macos/Packages/GotItModels/Tests/GotItModelsTests/MessageCodableTests.swift`
- Test: `apps/macos/Packages/GotItModels/Tests/GotItModelsTests/AnalysisResultCodableTests.swift`
- Test: `apps/macos/Packages/GotItModels/Tests/GotItModelsTests/APIShapesTests.swift`

- [ ] **Step 3.1: Failing test for `Message` round-trip with the four kinds**

`MessageCodableTests.swift`:

```swift
import Testing
import Foundation
@testable import GotItModels

@Suite struct MessageCodableTests {
    @Test func decodesScreenCapture() throws {
        let json = """
        {
          "id": "m1",
          "session_id": "s1",
          "kind": "screen_capture",
          "image_ref": "abc.png",
          "analysis": {
            "raw_text": "hello",
            "urls": [{"href": "https://example.com"}],
            "regions": [],
            "context_kind": "browser_article",
            "summary": "hi"
          },
          "source": "screenshot",
          "created_at": "2026-05-01T12:00:00.000Z"
        }
        """.data(using: .utf8)!
        let m = try JSONDecoder().decode(Message.self, from: json)
        guard case let .screenCapture(payload) = m else { Issue.record("wrong kind"); return }
        #expect(payload.id == "m1")
        #expect(payload.analysis.urls.first?.href == "https://example.com")
    }

    @Test func roundTripsAllKinds() throws {
        let now = "2026-05-01T12:00:00.000Z"
        let cases: [Message] = [
            .userText(.init(id: "1", sessionID: "s", text: "hi", source: .text, createdAt: now)),
            .assistant(.init(id: "2", sessionID: "s", text: "hello", createdAt: now)),
            .saveRecord(.init(id: "3", sessionID: "s", vaultPath: "GotIt!/x.md", instruction: nil, createdAt: now)),
        ]
        for c in cases {
            let data = try JSONEncoder().encode(c)
            let back = try JSONDecoder().decode(Message.self, from: data)
            #expect(back == c)
        }
    }
}
```

Run: `swift test --package-path apps/macos/Packages/GotItModels`. Expect: FAIL (`Message` undefined).

- [ ] **Step 3.2: Implement `Message`**

`Message.swift`:

```swift
import Foundation

public enum Source: String, Codable, Equatable, Sendable { case text, mic, listen }
public enum CaptureSource: String, Codable, Equatable, Sendable { case screenshot, keybind, refresh, invoke }

public struct ScreenCapturePayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let imageRef: String
    public let analysis: AnalysisResult
    public let source: CaptureSource
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, sessionID = "session_id", imageRef = "image_ref", analysis, source, createdAt = "created_at"
    }

    public init(id: String, sessionID: String, imageRef: String, analysis: AnalysisResult, source: CaptureSource, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.imageRef = imageRef
        self.analysis = analysis; self.source = source; self.createdAt = createdAt
    }
}

public struct UserTextPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let text: String
    public let source: Source
    public let createdAt: String

    enum CodingKeys: String, CodingKey { case id, sessionID = "session_id", text, source, createdAt = "created_at" }

    public init(id: String, sessionID: String, text: String, source: Source, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.text = text; self.source = source; self.createdAt = createdAt
    }
}

public struct AssistantPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let text: String
    public let createdAt: String

    enum CodingKeys: String, CodingKey { case id, sessionID = "session_id", text, createdAt = "created_at" }

    public init(id: String, sessionID: String, text: String, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.text = text; self.createdAt = createdAt
    }
}

public struct SaveRecordPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let vaultPath: String
    public let instruction: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, sessionID = "session_id", vaultPath = "vault_path", instruction, createdAt = "created_at"
    }

    public init(id: String, sessionID: String, vaultPath: String, instruction: String?, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.vaultPath = vaultPath
        self.instruction = instruction; self.createdAt = createdAt
    }
}

public enum Message: Codable, Equatable, Sendable {
    case screenCapture(ScreenCapturePayload)
    case userText(UserTextPayload)
    case assistant(AssistantPayload)
    case saveRecord(SaveRecordPayload)

    private enum DiscriminatorKey: String, CodingKey { case kind }
    private enum Kind: String, Codable {
        case screen_capture, user_text, assistant, save_record
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DiscriminatorKey.self)
        let kind = try c.decode(Kind.self, forKey: .kind)
        let single = try decoder.singleValueContainer()
        switch kind {
        case .screen_capture: self = .screenCapture(try single.decode(ScreenCapturePayload.self))
        case .user_text:      self = .userText(try single.decode(UserTextPayload.self))
        case .assistant:      self = .assistant(try single.decode(AssistantPayload.self))
        case .save_record:    self = .saveRecord(try single.decode(SaveRecordPayload.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DiscriminatorKey.self)
        switch self {
        case .screenCapture(let p):
            try c.encode(Kind.screen_capture, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .userText(let p):
            try c.encode(Kind.user_text, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .assistant(let p):
            try c.encode(Kind.assistant, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .saveRecord(let p):
            try c.encode(Kind.save_record, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        }
    }
}
```

The discriminator pattern keeps wire `kind` in lockstep with the TS enum.

- [ ] **Step 3.3: Implement `AnalysisResult`**

`AnalysisResult.swift`:

```swift
import Foundation

public enum ContextKind: String, Codable, Equatable, Sendable {
    case browser_article, code, chat, video, doc, unknown
}

public struct ExtractedURL: Codable, Equatable, Sendable {
    public let href: String
    public let anchor: String?
    public let nearText: String?
    enum CodingKeys: String, CodingKey { case href, anchor, nearText = "near_text" }
    public init(href: String, anchor: String? = nil, nearText: String? = nil) {
        self.href = href; self.anchor = anchor; self.nearText = nearText
    }
}

public struct BBox: Codable, Equatable, Sendable {
    public let x: Double; public let y: Double; public let w: Double; public let h: Double
    public init(x: Double, y: Double, w: Double, h: Double) { self.x = x; self.y = y; self.w = w; self.h = h }
}

public struct Region: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case header, paragraph, code, ui, media }
    public let kind: Kind
    public let text: String
    public let bbox: BBox?
    public init(kind: Kind, text: String, bbox: BBox? = nil) { self.kind = kind; self.text = text; self.bbox = bbox }
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
    public init(rawText: String, urls: [ExtractedURL], regions: [Region], contextKind: ContextKind, summary: String) {
        self.rawText = rawText; self.urls = urls; self.regions = regions
        self.contextKind = contextKind; self.summary = summary
    }
}
```

- [ ] **Step 3.4: Implement `Session.swift`**

```swift
import Foundation

public struct Session: Codable, Equatable, Sendable {
    public let id: String
    public let deviceID: String
    public let startedAt: String
    public let endedAt: String?
    enum CodingKeys: String, CodingKey {
        case id, deviceID = "device_id", startedAt = "started_at", endedAt = "ended_at"
    }
    public init(id: String, deviceID: String, startedAt: String, endedAt: String? = nil) {
        self.id = id; self.deviceID = deviceID; self.startedAt = startedAt; self.endedAt = endedAt
    }
}
```

- [ ] **Step 3.5: Implement `APIRequests.swift` and `APIResponses.swift`**

`APIRequests.swift`:

```swift
import Foundation

public enum ChatSource: String, Codable, Sendable { case text, mic, listen }

public struct ChatRequest: Codable, Equatable, Sendable {
    public let text: String
    public let source: ChatSource
    public init(text: String, source: ChatSource) { self.text = text; self.source = source }
}

public struct SaveRequest: Codable, Equatable, Sendable {
    public let instruction: String?
    public init(instruction: String? = nil) { self.instruction = instruction }
}
```

`APIResponses.swift`:

```swift
import Foundation

public struct DeviceRegistrationResponse: Codable, Equatable, Sendable {
    public let deviceID: String
    public let token: String
    enum CodingKeys: String, CodingKey { case deviceID = "device_id", token }
}

public struct CaptureResponse: Codable, Equatable, Sendable {
    public let messageID: String
    public let analysis: AnalysisResult
    public let assistantMessage: AssistantPayload
    enum CodingKeys: String, CodingKey {
        case messageID = "message_id", analysis, assistantMessage = "assistant_message"
    }
}

public struct ChatResponse: Codable, Equatable, Sendable {
    public let messageID: String
    public let assistantMessage: AssistantPayload
    enum CodingKeys: String, CodingKey { case messageID = "message_id", assistantMessage = "assistant_message" }
}

public struct SaveDraftResponse: Codable, Equatable, Sendable {
    public let vaultRelativePath: String
    public let markdown: String
    public let saveRecordID: String
    enum CodingKeys: String, CodingKey {
        case vaultRelativePath = "vault_relative_path", markdown, saveRecordID = "save_record_id"
    }
}

public struct ActiveSessionResponse: Codable, Equatable, Sendable {
    public let session: Session
    public let messagesTail: [Message]
    enum CodingKeys: String, CodingKey { case session, messagesTail = "messages_tail" }
}

public struct CreateSessionResponse: Codable, Equatable, Sendable {
    public let sessionID: String
    public let startedAt: String
    enum CodingKeys: String, CodingKey { case sessionID = "session_id", startedAt = "started_at" }
}

public struct HealthResponse: Codable, Equatable, Sendable {
    public let ok: Bool
    public let version: String
}
```

`DeviceRegistration.swift`:

```swift
import Foundation
public struct DeviceRegistrationRequest: Codable, Equatable, Sendable {
    public let installID: String
    enum CodingKeys: String, CodingKey { case installID = "install_id" }
    public init(installID: String) { self.installID = installID }
}
```

- [ ] **Step 3.6: Add `APIShapesTests.swift` (round-trip every response shape against canonical fixtures)**

Mirror at least one fixture for each response. For brevity, one example:

```swift
@Test func decodesSaveDraftResponse() throws {
    let json = """
    {"vault_relative_path":"GotIt!/2026-05-01-foo.md","markdown":"# Title","save_record_id":"sr_1"}
    """.data(using: .utf8)!
    let r = try JSONDecoder().decode(SaveDraftResponse.self, from: json)
    #expect(r.vaultRelativePath == "GotIt!/2026-05-01-foo.md")
    #expect(r.markdown == "# Title")
}
```

Add equivalent decode tests for `CaptureResponse`, `ChatResponse`, `ActiveSessionResponse`, `CreateSessionResponse`, `DeviceRegistrationResponse`, `HealthResponse`. Each test is a single JSON literal that mirrors the actual server response shape — reuse the snippets shown for those endpoints in `packages/api/src/__tests__/integration/routes/`.

- [ ] **Step 3.7: Run all `GotItModels` tests**

```bash
swift test --package-path apps/macos/Packages/GotItModels
```

Expect: PASS.

- [ ] **Step 3.8: Commit**

```bash
git add apps/macos/Packages/GotItModels
git commit -m "feat(macos): GotItModels package with Codable DTOs and round-trip tests"
```

---

## Task 4 — `GotItInfra`: APIError, Endpoint, APIClient protocol, Null implementation

**Files:**

- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/APIError.swift`
- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/Endpoint.swift`
- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/APIClient.swift`
- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/NullAPIClient.swift`
- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/APIClientFactory.swift`
- Test: `apps/macos/Packages/GotItInfra/Tests/GotItInfraTests/APIClientNullTests.swift`

- [ ] **Step 4.1: Failing test — `NullAPIClient` returns configured response for `health`**

`APIClientNullTests.swift`:

```swift
import Testing
import Foundation
import GotItModels
@testable import GotItInfra

@Suite struct APIClientNullTests {
    @Test func healthReturnsConfiguredResponse() async throws {
        let client = APIClientFactory.makeNull(
            responses: [.health: HealthResponse(ok: true, version: "1.2.3")]
        )
        let r: HealthResponse = try await client.send(.health)
        #expect(r.version == "1.2.3")
    }

    @Test func unconfiguredEndpointThrowsNullNotConfigured() async {
        let client = APIClientFactory.makeNull()
        await #expect(throws: APIError.self) {
            let _: HealthResponse = try await client.send(.health)
        }
    }
}
```

Run: `swift test --package-path apps/macos/Packages/GotItInfra`. Expect: FAIL.

- [ ] **Step 4.2: Implement `APIError.swift`**

```swift
import Foundation

public enum APIError: Error, Equatable, Sendable {
    case offline
    case unauthorized
    case http(status: Int, message: String?)
    case transport(String)
    case decoding(String)
    case nullNotConfigured(String)
}
```

- [ ] **Step 4.3: Implement `Endpoint.swift`**

The endpoint type is a sealed enum; each case carries the inputs the client needs to build a request, plus a discriminator for the null client to look up canned responses. Phantom types are not used — instead `send(_:)` is generic over the response.

```swift
import Foundation
import GotItModels

public enum CaptureSourceWire: String, Sendable { case screenshot, keybind, refresh, invoke }

public enum Endpoint: Sendable {
    case device(installID: String)                                       // -> DeviceRegistrationResponse
    case health                                                          // -> HealthResponse
    case sessionsActive                                                  // -> ActiveSessionResponse
    case sessionsCreate                                                  // -> CreateSessionResponse
    case capture(image: Data, source: CaptureSourceWire)                 // -> CaptureResponse
    case chat(text: String, source: ChatSource)                         // -> ChatResponse
    case save(instruction: String?)                                      // -> SaveDraftResponse

    public enum ID: Hashable, Sendable {
        case device, health, sessionsActive, sessionsCreate
        case capture, chat, save
    }

    public var id: ID {
        switch self {
        case .device: return .device
        case .health: return .health
        case .sessionsActive: return .sessionsActive
        case .sessionsCreate: return .sessionsCreate
        case .capture: return .capture
        case .chat: return .chat
        case .save: return .save
        }
    }
}
```

- [ ] **Step 4.4: Implement `APIClient.swift`**

```swift
import Foundation

public protocol APIClient: Sendable {
    func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R
}
```

- [ ] **Step 4.5: Implement `NullAPIClient.swift`**

```swift
import Foundation

public struct NullResponses: Sendable {
    public var byEndpoint: [Endpoint.ID: any Decodable & Sendable]
    public var failures: [Endpoint.ID: APIError]
    public init(byEndpoint: [Endpoint.ID: any Decodable & Sendable] = [:], failures: [Endpoint.ID: APIError] = [:]) {
        self.byEndpoint = byEndpoint; self.failures = failures
    }
}

internal actor NullAPIClient: APIClient {
    private var script: NullResponses

    init(_ script: NullResponses) { self.script = script }

    func setScript(_ script: NullResponses) { self.script = script }

    nonisolated public func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R {
        try await answer(for: endpoint)
    }

    private func answer<R: Decodable & Sendable>(for endpoint: Endpoint) async throws -> R {
        if let err = script.failures[endpoint.id] { throw err }
        guard let value = script.byEndpoint[endpoint.id] else {
            throw APIError.nullNotConfigured("no response configured for \(endpoint.id)")
        }
        guard let typed = value as? R else {
            throw APIError.decoding("null response wrong type for \(endpoint.id)")
        }
        return typed
    }
}
```

- [ ] **Step 4.6: Implement `APIClientFactory.swift` (live factory wired in Task 5)**

```swift
import Foundation

public enum APIClientFactory {
    public static func makeNull(
        responses: [Endpoint.ID: any Decodable & Sendable] = [:],
        failures: [Endpoint.ID: APIError] = [:]
    ) -> APIClient {
        NullAPIClient(NullResponses(byEndpoint: responses, failures: failures))
    }

    // makeLive is added in Task 5 once URLSessionAPIClient exists.
}
```

- [ ] **Step 4.7: Run tests**

```bash
swift test --package-path apps/macos/Packages/GotItInfra
```

Expect: PASS.

- [ ] **Step 4.8: Commit**

```bash
git add apps/macos/Packages/GotItInfra
git commit -m "feat(infra): APIClient protocol, Endpoint enum, NullAPIClient"
```

---

## Task 5 — `URLSessionAPIClient` (live), token attach, retry, 401 re-pair

**Files:**

- Create: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift`
- Modify: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/APIClientFactory.swift`
- Test: `apps/macos/Packages/GotItInfra/Tests/GotItInfraTests/APIClient401Tests.swift`
- Test: `apps/macos/Packages/GotItInfra/Tests/GotItInfraTests/APIClientRetryTests.swift`

The live client uses an injected `URLProtocol` stack so unit tests run without sockets. `URLProtocol` subclassing is the standard test seam for `URLSession` and is allowed even though we don't use mocking frameworks — it is the dependency-injection seam Apple itself documents.

- [ ] **Step 5.1: Failing 401 re-pair test**

`APIClient401Tests.swift`:

```swift
import Testing
import Foundation
import GotItModels
@testable import GotItInfra

@Suite struct APIClient401Tests {
    @Test func repairs401AndRetries() async throws {
        let stub = StubProtocol.shared
        await stub.script([
            .response(status: 401, body: Data("unauthorized".utf8)),                          // GET /health
            .response(status: 201, body: try JSONEncoder().encode(                            // POST /device
                DeviceRegistrationResponse(deviceID: "d1", token: "t-new")
            )),
            .response(status: 200, body: try JSONEncoder().encode(                            // retry GET /health
                HealthResponse(ok: true, version: "x")
            )),
        ])
        let session = URLSession(configuration: StubProtocol.makeConfig())
        let keychain = KeychainStoreFactory.makeNull(initial: "t-old")
        let client = APIClientFactory.makeLive(
            baseURL: URL(string: "https://example.test")!,
            session: session,
            keychain: keychain,
            installID: "i-1"
        )
        let r: HealthResponse = try await client.send(.health)
        #expect(r.ok == true)
        let stored = try await keychain.read()
        #expect(stored == "t-new")
        let calls = await stub.recordedAuthHeaders()
        #expect(calls == ["Bearer t-old", nil, "Bearer t-new"])
    }

    @Test func surfacesUnauthorizedWhenRepairAlsoFails() async throws {
        let stub = StubProtocol.shared
        await stub.script([
            .response(status: 401, body: Data()),                                             // first /health
            .response(status: 401, body: Data()),                                             // /device fails
        ])
        let session = URLSession(configuration: StubProtocol.makeConfig())
        let keychain = KeychainStoreFactory.makeNull(initial: "t")
        let client = APIClientFactory.makeLive(
            baseURL: URL(string: "https://example.test")!,
            session: session,
            keychain: keychain,
            installID: "i-1"
        )
        await #expect(throws: APIError.unauthorized) {
            let _: HealthResponse = try await client.send(.health)
        }
    }
}
```

`StubProtocol` is a `URLProtocol` subclass implemented as part of this task in `Tests/GotItInfraTests/Helpers/StubProtocol.swift`. It records auth headers per call and dequeues a script of responses. Implement it minimally — under 80 lines.

`KeychainStoreFactory.makeNull(initial:)` is added in Task 8; for now stub a local actor in the test file that conforms to `KeychainStore` — Task 8 replaces it.

Run tests. Expect: FAIL (live factory and `URLSessionAPIClient` don't exist yet).

- [ ] **Step 5.2: Implement `URLSessionAPIClient.swift`**

```swift
import Foundation
import GotItModels

internal actor URLSessionAPIClient: APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let installID: String

    init(baseURL: URL, session: URLSession, keychain: KeychainStore, installID: String) {
        self.baseURL = baseURL; self.session = session
        self.keychain = keychain; self.installID = installID
    }

    nonisolated public func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R {
        try await sendOnce(endpoint, allowRepair: true)
    }

    private func sendOnce<R: Decodable & Sendable>(_ endpoint: Endpoint, allowRepair: Bool) async throws -> R {
        let req = try await buildRequest(endpoint)
        let (data, resp) = try await performWithRetry(req)
        let http = resp as! HTTPURLResponse
        switch http.statusCode {
        case 200...299:
            return try decode(R.self, data: data)
        case 401:
            guard allowRepair, case .device = endpoint else {
                if allowRepair { try await rePair(); return try await sendOnce(endpoint, allowRepair: false) }
                throw APIError.unauthorized
            }
            throw APIError.unauthorized
        case 400...499:
            throw APIError.http(status: http.statusCode, message: String(data: data, encoding: .utf8))
        default:
            throw APIError.http(status: http.statusCode, message: String(data: data, encoding: .utf8))
        }
    }

    private func rePair() async throws {
        try await keychain.delete()
        let resp: DeviceRegistrationResponse = try await sendOnce(.device(installID: installID), allowRepair: false)
        try await keychain.write(resp.token)
    }

    private func performWithRetry(_ req: URLRequest) async throws -> (Data, URLResponse) {
        let backoffs: [UInt64] = [0, 250_000_000, 500_000_000]
        var last: Error?
        for delay in backoffs {
            if delay > 0 { try await Task.sleep(nanoseconds: delay) }
            do {
                let (data, resp) = try await session.data(for: req)
                let http = resp as! HTTPURLResponse
                if (500...599).contains(http.statusCode) { last = APIError.http(status: http.statusCode, message: nil); continue }
                return (data, resp)
            } catch {
                last = error
                if !isRetryable(error) { throw APIError.transport(String(describing: error)) }
            }
        }
        throw APIError.transport(String(describing: last ?? URLError(.unknown)))
    }

    private func isRetryable(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost, .notConnectedToInternet, .cannotConnectToHost: return true
        default: return false
        }
    }

    private func buildRequest(_ endpoint: Endpoint) async throws -> URLRequest {
        var req: URLRequest
        switch endpoint {
        case .device(let installID):
            req = URLRequest(url: baseURL.appendingPathComponent("device"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(DeviceRegistrationRequest(installID: installID))
            return req // device call is unauthenticated
        case .health:
            req = URLRequest(url: baseURL.appendingPathComponent("health"))
            req.httpMethod = "GET"
        case .sessionsActive:
            req = URLRequest(url: baseURL.appendingPathComponent("sessions/active"))
            req.httpMethod = "GET"
        case .sessionsCreate:
            req = URLRequest(url: baseURL.appendingPathComponent("sessions"))
            req.httpMethod = "POST"
        case .capture(let image, let source):
            req = URLRequest(url: baseURL.appendingPathComponent("capture"))
            req.httpMethod = "POST"
            let boundary = "----GotItBoundary\(UUID().uuidString)"
            req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            req.httpBody = makeMultipartBody(boundary: boundary, image: image, source: source.rawValue)
        case .chat(let text, let source):
            req = URLRequest(url: baseURL.appendingPathComponent("chat"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(ChatRequest(text: text, source: source))
        case .save(let instruction):
            req = URLRequest(url: baseURL.appendingPathComponent("save"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(SaveRequest(instruction: instruction))
        }
        if let token = try? await keychain.read(), let token = token, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func makeMultipartBody(boundary: String, image: Data, source: String) -> Data {
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"source\"\r\n\r\n\(source)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"capture.png\"\r\nContent-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(image)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }

    private func decode<R: Decodable>(_ type: R.Type, data: Data) throws -> R {
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}
```

Note the `KeychainStore` protocol surface used here (`read() async throws -> String?`, `write(_:)`, `delete()`) — it is defined in Task 8. To keep this task building, add a temporary `protocol KeychainStore { func read() async throws -> String? ; func write(_ token: String) async throws ; func delete() async throws }` placeholder in `Keychain/KeychainStore.swift`. Task 8 expands it.

- [ ] **Step 5.3: Add `makeLive` to `APIClientFactory`**

```swift
public extension APIClientFactory {
    static func makeLive(
        baseURL: URL,
        session: URLSession = .shared,
        keychain: KeychainStore,
        installID: String
    ) -> APIClient {
        URLSessionAPIClient(baseURL: baseURL, session: session, keychain: keychain, installID: installID)
    }
}
```

- [ ] **Step 5.4: Add `APIClientRetryTests.swift`**

```swift
@Suite struct APIClientRetryTests {
    @Test func retriesOn5xxThenSucceeds() async throws {
        let stub = StubProtocol.shared
        await stub.script([
            .response(status: 503, body: Data()),
            .response(status: 200, body: try JSONEncoder().encode(HealthResponse(ok: true, version: "v"))),
        ])
        let client = APIClientFactory.makeLive(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: StubProtocol.makeConfig()),
            keychain: KeychainStoreFactory.makeNull(initial: nil),
            installID: "i"
        )
        let r: HealthResponse = try await client.send(.health)
        #expect(r.version == "v")
    }

    @Test func surfacesOfflineOnTransport() async throws {
        let stub = StubProtocol.shared
        await stub.script([.error(URLError(.notConnectedToInternet))])
        let client = APIClientFactory.makeLive(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: StubProtocol.makeConfig()),
            keychain: KeychainStoreFactory.makeNull(initial: nil),
            installID: "i"
        )
        await #expect(throws: APIError.self) {
            let _: HealthResponse = try await client.send(.health)
        }
    }
}
```

The retry budget here is small — exhausted retries surface as `.transport` (which the UI maps to "offline") rather than `.offline`; `OfflineMonitor` is the source of the offline banner state.

- [ ] **Step 5.5: Run tests, expect PASS**

```bash
swift test --package-path apps/macos/Packages/GotItInfra
```

- [ ] **Step 5.6: Commit**

```bash
git add apps/macos/Packages/GotItInfra
git commit -m "feat(infra): URLSessionAPIClient with token attach, 5xx retry, and 401 re-pair"
```

---

## Task 6 — `KeychainStore` (live + null) and `InstallIDStore`

**Files:**

- Replace placeholder protocol with full surface: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/Keychain/KeychainStore.swift`
- Create: `Keychain/SecKeychainStore.swift` (live)
- Create: `Keychain/NullKeychainStore.swift`
- Create: `Keychain/KeychainStoreFactory.swift`
- Create: `Keychain/InstallIDStore.swift` (UserDefaults-backed UUID)
- Test: `Tests/GotItInfraTests/KeychainStoreLiveTests.swift`

- [ ] **Step 6.1: Failing test for live Keychain wrapper**

Use a unique service name per test run so parallel tests don't collide and to avoid the developer's real Keychain entries:

```swift
import Testing
import Foundation
@testable import GotItInfra

@Suite struct KeychainStoreLiveTests {
    @Test func writeReadDeleteRoundTrip() async throws {
        let service = "dev.gotit.test.\(UUID().uuidString)"
        let store = KeychainStoreFactory.makeLive(service: service, account: "device_token")
        try await store.delete() // ensure empty
        #expect(try await store.read() == nil)
        try await store.write("abc")
        #expect(try await store.read() == "abc")
        try await store.write("def") // upsert
        #expect(try await store.read() == "def")
        try await store.delete()
        #expect(try await store.read() == nil)
    }
}
```

- [ ] **Step 6.2: Define the protocol fully**

```swift
import Foundation

public protocol KeychainStore: Sendable {
    func read() async throws -> String?
    func write(_ token: String) async throws
    func delete() async throws
}
```

- [ ] **Step 6.3: Implement `SecKeychainStore`**

Use `kSecClassGenericPassword` with `kSecAttrService` + `kSecAttrAccount`. Standard Apple sample code. Wrap synchronous `SecItem*` calls inside an actor for thread safety.

```swift
import Foundation
import Security

internal actor SecKeychainStore: KeychainStore {
    private let service: String
    private let account: String
    init(service: String, account: String) { self.service = service; self.account = account }

    func read() async throws -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let s = String(data: data, encoding: .utf8) else {
            throw APIError.transport("keychain read failed: \(status)")
        }
        return s
    }

    func write(_ token: String) async throws {
        let data = Data(token.utf8)
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(attrs as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = attrs; add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let s2 = SecItemAdd(add as CFDictionary, nil)
            guard s2 == errSecSuccess else { throw APIError.transport("keychain add failed: \(s2)") }
            return
        }
        guard status == errSecSuccess else { throw APIError.transport("keychain update failed: \(status)") }
    }

    func delete() async throws {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(q as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw APIError.transport("keychain delete failed: \(status)")
        }
    }
}
```

- [ ] **Step 6.4: Implement `NullKeychainStore`**

```swift
internal actor NullKeychainStore: KeychainStore {
    private var token: String?
    init(initial: String?) { self.token = initial }
    func read() async throws -> String? { token }
    func write(_ token: String) async throws { self.token = token }
    func delete() async throws { token = nil }
}
```

- [ ] **Step 6.5: `KeychainStoreFactory.swift`**

```swift
public enum KeychainStoreFactory {
    public static func makeLive(service: String, account: String) -> KeychainStore {
        SecKeychainStore(service: service, account: account)
    }
    public static func makeNull(initial: String? = nil) -> KeychainStore {
        NullKeychainStore(initial: initial)
    }
}
```

- [ ] **Step 6.6: `InstallIDStore.swift`**

```swift
import Foundation

public protocol InstallIDStore: Sendable {
    func get() -> String
}

public enum InstallIDStoreFactory {
    public static func makeLive(defaults: UserDefaults = .standard, key: String = "GotItInstallID") -> InstallIDStore {
        UserDefaultsInstallIDStore(defaults: defaults, key: key)
    }
    public static func makeNull(_ id: String = "test-install") -> InstallIDStore {
        FixedInstallIDStore(id: id)
    }
}

internal struct UserDefaultsInstallIDStore: InstallIDStore {
    let defaults: UserDefaults
    let key: String
    func get() -> String {
        if let s = defaults.string(forKey: key) { return s }
        let id = UUID().uuidString
        defaults.set(id, forKey: key)
        return id
    }
}

internal struct FixedInstallIDStore: InstallIDStore {
    let id: String
    func get() -> String { id }
}
```

- [ ] **Step 6.7: Run all infra tests**

```bash
swift test --package-path apps/macos/Packages/GotItInfra
```

Expect: PASS. The 401 re-pair test from Task 5 now uses the real `KeychainStoreFactory.makeNull` instead of a placeholder.

- [ ] **Step 6.8: Commit**

```bash
git add apps/macos/Packages/GotItInfra
git commit -m "feat(infra): KeychainStore (Sec live + null) and InstallIDStore"
```

---

## Task 7 — `MarkdownFileWriter` + pure `resolveCollision` helper

**Files:**

- Create: `Files/MarkdownFileWriter.swift` (protocol + factory)
- Create: `Files/FileManagerMarkdownWriter.swift` (live)
- Create: `Files/NullMarkdownFileWriter.swift`
- Create: `Files/ResolveCollision.swift` (pure)
- Test: `Tests/GotItInfraTests/ResolveCollisionTests.swift`
- Test: `Tests/GotItInfraTests/MarkdownFileWriterLiveTests.swift`

- [ ] **Step 7.1: Failing tests for `resolveCollision`**

```swift
import Testing
@testable import GotItInfra

@Suite struct ResolveCollisionTests {
    @Test func returnsCandidateWhenUnique() {
        let r = resolveCollision(existing: ["a.md", "b.md"], candidate: "c.md")
        #expect(r == "c.md")
    }

    @Test func appendsSuffixWhenCollides() {
        let r = resolveCollision(existing: ["c.md"], candidate: "c.md")
        #expect(r == "c-1.md")
    }

    @Test func incrementsUntilUnique() {
        let r = resolveCollision(existing: ["c.md", "c-1.md", "c-2.md"], candidate: "c.md")
        #expect(r == "c-3.md")
    }

    @Test func handlesNoExtension() {
        let r = resolveCollision(existing: ["c"], candidate: "c")
        #expect(r == "c-1")
    }

    @Test func caseInsensitiveOnHFSplus() {
        // macOS HFS+ default is case-insensitive; the resolver matches that.
        let r = resolveCollision(existing: ["FOO.md"], candidate: "foo.md")
        #expect(r == "foo-1.md")
    }
}
```

Run: FAIL.

- [ ] **Step 7.2: Implement `resolveCollision`**

```swift
import Foundation

internal func resolveCollision(existing: [String], candidate: String) -> String {
    let lowercased = Set(existing.map { $0.lowercased() })
    if !lowercased.contains(candidate.lowercased()) { return candidate }
    let url = URL(fileURLWithPath: candidate)
    let base = url.deletingPathExtension().lastPathComponent
    let ext = url.pathExtension
    var n = 1
    while true {
        let next = ext.isEmpty ? "\(base)-\(n)" : "\(base)-\(n).\(ext)"
        if !lowercased.contains(next.lowercased()) { return next }
        n += 1
    }
}
```

Internal because it is a private implementation detail of the file writer. Tests use `@testable import`. PASS.

- [ ] **Step 7.3: Failing test for live `FileManagerMarkdownWriter`**

```swift
@Suite struct MarkdownFileWriterLiveTests {
    @Test func writesAtomicallyToVaultRelativePath() async throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let writer = MarkdownFileWriterFactory.makeLive()
        let final = try await writer.write(
            folder: tmp,
            relativePath: "GotIt!/2026-05-01-foo.md",
            markdown: "# hello"
        )
        let content = try String(contentsOf: final, encoding: .utf8)
        #expect(content == "# hello")
        #expect(final.path.hasSuffix("GotIt!/2026-05-01-foo.md"))
    }

    @Test func resolvesCollisionWithSuffix() async throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let writer = MarkdownFileWriterFactory.makeLive()
        _ = try await writer.write(folder: tmp, relativePath: "GotIt!/x.md", markdown: "first")
        let second = try await writer.write(folder: tmp, relativePath: "GotIt!/x.md", markdown: "second")
        #expect(second.lastPathComponent == "x-1.md")
    }
}

private func makeTempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gotit-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}
```

Run: FAIL.

- [ ] **Step 7.4: Implement protocol + factory + live**

```swift
import Foundation

public protocol MarkdownFileWriter: Sendable {
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL
}

public enum MarkdownFileWriterFactory {
    public static func makeLive() -> MarkdownFileWriter { FileManagerMarkdownWriter() }
    public static func makeNull(failsWith error: Error? = nil) -> MarkdownFileWriter {
        NullMarkdownFileWriter(error: error)
    }
}

internal struct FileManagerMarkdownWriter: MarkdownFileWriter {
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL {
        let target = folder.appendingPathComponent(relativePath)
        let parent = target.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        let siblings = (try? FileManager.default.contentsOfDirectory(atPath: parent.path)) ?? []
        let resolved = resolveCollision(existing: siblings, candidate: target.lastPathComponent)
        let final = parent.appendingPathComponent(resolved)
        try Data(markdown.utf8).write(to: final, options: [.atomic])
        return final
    }
}

internal struct NullMarkdownFileWriter: MarkdownFileWriter {
    let error: Error?
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL {
        if let error { throw error }
        return folder.appendingPathComponent(relativePath)
    }
}
```

Run: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add apps/macos/Packages/GotItInfra
git commit -m "feat(infra): MarkdownFileWriter + pure resolveCollision helper"
```

---

## Task 8 — `SecureBookmarkStore` (security-scoped bookmarks for the vault folder)

**Files:**

- Create: `Bookmarks/SecureBookmarkStore.swift`
- Create: `Bookmarks/UserDefaultsBookmarkStore.swift`
- Create: `Bookmarks/NullBookmarkStore.swift`
- Test: `Tests/GotItInfraTests/SecureBookmarkStoreLiveTests.swift`

- [ ] **Step 8.1: Failing test (live, tmp dir)**

```swift
@Suite struct SecureBookmarkStoreLiveTests {
    @Test func storesAndResolvesBookmark() throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let store = SecureBookmarkStoreFactory.makeLive(defaults: defaults, key: "vault")
        try store.save(folder: tmp)
        let resolved = try store.resolve()
        #expect(resolved.url.standardizedFileURL == tmp.standardizedFileURL)
        // start/stop scoped access pair must be balanced; test should not leak access
        resolved.stopAccess()
    }

    @Test func returnsNilWhenUnset() throws {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let store = SecureBookmarkStoreFactory.makeLive(defaults: defaults, key: "vault")
        #expect(store.tryResolve() == nil)
    }
}
```

- [ ] **Step 8.2: Implement protocol + types**

```swift
import Foundation

public struct ResolvedBookmark: Sendable {
    public let url: URL
    public let stopAccess: @Sendable () -> Void
}

public protocol SecureBookmarkStore: Sendable {
    func save(folder: URL) throws
    func resolve() throws -> ResolvedBookmark
    func tryResolve() -> ResolvedBookmark?
    func clear()
}

public enum SecureBookmarkStoreFactory {
    public static func makeLive(defaults: UserDefaults = .standard, key: String = "GotItVaultBookmark") -> SecureBookmarkStore {
        UserDefaultsBookmarkStore(defaults: defaults, key: key)
    }
    public static func makeNull(_ folder: URL? = nil) -> SecureBookmarkStore {
        NullBookmarkStore(folder: folder)
    }
}

internal final class UserDefaultsBookmarkStore: SecureBookmarkStore, @unchecked Sendable {
    let defaults: UserDefaults
    let key: String
    init(defaults: UserDefaults, key: String) { self.defaults = defaults; self.key = key }

    func save(folder: URL) throws {
        let data = try folder.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(data, forKey: key)
    }

    func resolve() throws -> ResolvedBookmark {
        guard let data = defaults.data(forKey: key) else { throw APIError.transport("no vault bookmark stored") }
        var stale = false
        let url = try URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale {
            // refresh — best-effort; keep going with the resolved URL
            try? save(folder: url)
        }
        let started = url.startAccessingSecurityScopedResource()
        return ResolvedBookmark(url: url, stopAccess: {
            if started { url.stopAccessingSecurityScopedResource() }
        })
    }

    func tryResolve() -> ResolvedBookmark? { try? resolve() }

    func clear() { defaults.removeObject(forKey: key) }
}

internal final class NullBookmarkStore: SecureBookmarkStore, @unchecked Sendable {
    private var folder: URL?
    init(folder: URL?) { self.folder = folder }
    func save(folder: URL) throws { self.folder = folder }
    func resolve() throws -> ResolvedBookmark {
        guard let f = folder else { throw APIError.transport("no folder") }
        return ResolvedBookmark(url: f, stopAccess: {})
    }
    func tryResolve() -> ResolvedBookmark? { folder.map { ResolvedBookmark(url: $0, stopAccess: {}) } }
    func clear() { folder = nil }
}
```

- [ ] **Step 8.3: Run tests, expect PASS, commit**

```bash
swift test --package-path apps/macos/Packages/GotItInfra
git add apps/macos/Packages/GotItInfra
git commit -m "feat(infra): SecureBookmarkStore for security-scoped vault bookmarks"
```

---

## Task 9 — `OfflineMonitor`

**Files:**

- Create: `Network/OfflineMonitor.swift` (protocol + factory + live + null)
- Test: `Tests/GotItInfraTests/OfflineMonitorTests.swift`

- [ ] **Step 9.1: Failing tests**

```swift
@Suite struct OfflineMonitorTests {
    @Test func nullStartsOnlineByDefault() async {
        let m = OfflineMonitorFactory.makeNull()
        #expect(await m.isOnline == true)
    }

    @Test func recheckRespectsScript() async {
        let m = OfflineMonitorFactory.makeNull(initial: true)
        await m.script(results: [false, true])
        _ = await m.recheck()
        #expect(await m.isOnline == false)
        _ = await m.recheck()
        #expect(await m.isOnline == true)
    }
}
```

- [ ] **Step 9.2: Protocol + null + live**

```swift
import Foundation

public protocol OfflineMonitor: Sendable {
    var isOnline: Bool { get async }
    @discardableResult func recheck() async -> Bool
}

public enum OfflineMonitorFactory {
    public static func makeLive(baseURL: URL, session: URLSession = .shared, timeoutMs: Int = 1500) -> OfflineMonitor {
        HealthProbeOfflineMonitor(baseURL: baseURL, session: session, timeoutMs: timeoutMs)
    }
    public static func makeNull(initial: Bool = true) -> ScriptedOfflineMonitor {
        ScriptedOfflineMonitor(initial: initial)
    }
}

public actor ScriptedOfflineMonitor: OfflineMonitor {
    public private(set) var isOnline: Bool
    private var queue: [Bool] = []
    init(initial: Bool) { self.isOnline = initial }
    public func script(results: [Bool]) { queue = results }
    @discardableResult public func recheck() async -> Bool {
        if !queue.isEmpty { isOnline = queue.removeFirst() }
        return isOnline
    }
}

internal actor HealthProbeOfflineMonitor: OfflineMonitor {
    private(set) var isOnline: Bool = true
    private let baseURL: URL
    private let session: URLSession
    private let timeoutMs: Int

    init(baseURL: URL, session: URLSession, timeoutMs: Int) {
        self.baseURL = baseURL; self.session = session; self.timeoutMs = timeoutMs
    }

    @discardableResult func recheck() async -> Bool {
        var req = URLRequest(url: baseURL.appendingPathComponent("health"))
        req.timeoutInterval = TimeInterval(timeoutMs) / 1000.0
        do {
            let (_, resp) = try await session.data(for: req)
            let http = resp as! HTTPURLResponse
            isOnline = (200...299).contains(http.statusCode)
        } catch {
            isOnline = false
        }
        return isOnline
    }
}
```

PASS, commit.

```bash
git commit -m "feat(infra): OfflineMonitor with /health probe and scripted null"
```

---

## Task 10 — `ScreenshotWatcher` (`NSMetadataQuery`)

**Files:**

- Create: `Screenshot/ScreenshotWatcher.swift` (protocol, event type, factory)
- Create: `Screenshot/MetadataQueryScreenshotWatcher.swift`
- Create: `Screenshot/NullScreenshotWatcher.swift`

`NSMetadataQuery` doesn't lend itself to deterministic unit tests — the manual smoke (spec §11.5 #1) covers it. The plan is null-driven view-model tests that send synthesized events.

- [ ] **Step 10.1: Define protocol and types**

```swift
import Foundation

public struct ScreenshotEvent: Sendable, Equatable {
    public let fileURL: URL
    public let createdAt: Date
}

public protocol ScreenshotWatcher: Sendable {
    func start() async
    func stop() async
    /// Emits each detected screenshot exactly once.
    func events() -> AsyncStream<ScreenshotEvent>
}

public enum ScreenshotWatcherFactory {
    public static func makeLive() -> ScreenshotWatcher { MetadataQueryScreenshotWatcher() }
    public static func makeNull() -> ScriptedScreenshotWatcher { ScriptedScreenshotWatcher() }
}
```

- [ ] **Step 10.2: Live wrapper**

```swift
import Foundation

internal final class MetadataQueryScreenshotWatcher: NSObject, ScreenshotWatcher, @unchecked Sendable {
    private let query = NSMetadataQuery()
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    private var stream: AsyncStream<ScreenshotEvent>?
    private var seen: Set<URL> = []

    override init() {
        super.init()
        query.predicate = NSPredicate(format: "kMDItemIsScreenCapture = 1")
        query.searchScopes = [NSMetadataQueryUserHomeScope]
        NotificationCenter.default.addObserver(self, selector: #selector(handleResults(_:)),
            name: .NSMetadataQueryDidFinishGathering, object: query)
        NotificationCenter.default.addObserver(self, selector: #selector(handleResults(_:)),
            name: .NSMetadataQueryDidUpdate, object: query)
    }

    func start() async {
        await MainActor.run { _ = query.start() }
    }

    func stop() async {
        await MainActor.run { query.stop() }
    }

    func events() -> AsyncStream<ScreenshotEvent> {
        if let s = stream { return s }
        let s = AsyncStream<ScreenshotEvent> { c in self.continuation = c }
        self.stream = s
        return s
    }

    @objc private func handleResults(_ note: Notification) {
        for i in 0..<query.resultCount {
            guard let item = query.result(at: i) as? NSMetadataItem,
                  let path = item.value(forAttribute: NSMetadataItemPathKey) as? String else { continue }
            let url = URL(fileURLWithPath: path)
            if seen.contains(url) { continue }
            seen.insert(url)
            let date = (item.value(forAttribute: NSMetadataItemContentCreationDateKey) as? Date) ?? Date()
            continuation?.yield(ScreenshotEvent(fileURL: url, createdAt: date))
        }
    }
}
```

- [ ] **Step 10.3: Null + scripted**

```swift
public actor ScriptedScreenshotWatcher: ScreenshotWatcher {
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    public func start() async {}
    public func stop() async { continuation?.finish() }
    public func events() -> AsyncStream<ScreenshotEvent> {
        AsyncStream { c in self.continuation = c }
    }
    public func emit(_ event: ScreenshotEvent) async { continuation?.yield(event) }
}
```

- [ ] **Step 10.4: Commit**

```bash
git commit -m "feat(infra): ScreenshotWatcher (NSMetadataQuery wrapper) + scripted null"
```

---

## Task 11 — `ScreenCaptureService` (`ScreenCaptureKit`) for "Look again"

**Files:**

- Create: `Capture/ScreenCaptureService.swift`
- Create: `Capture/ScreenCaptureKitService.swift`
- Create: `Capture/NullScreenCaptureService.swift`

ScreenCaptureKit requires real permission grant; live wrapper is verified by manual smoke (§11.5 #7). Null is what view-model tests use.

- [ ] **Step 11.1: Protocol + factory**

```swift
import Foundation
import AppKit

public enum ScreenCaptureError: Error, Equatable, Sendable {
    case permissionDenied
    case noActiveDisplay
    case captureFailed(String)
}

public protocol ScreenCaptureService: Sendable {
    /// Captures the display containing the mouse pointer (or the keyWindow if any).
    /// Returns PNG-encoded bytes.
    func captureActiveDisplay() async throws -> Data
}

public enum ScreenCaptureServiceFactory {
    public static func makeLive() -> ScreenCaptureService { ScreenCaptureKitService() }
    public static func makeNull(returning data: Data = Data([0x89, 0x50, 0x4E, 0x47]),
                                 failsWith error: ScreenCaptureError? = nil) -> ScreenCaptureService {
        NullScreenCaptureService(data: data, error: error)
    }
}
```

- [ ] **Step 11.2: Live wrapper**

```swift
import Foundation
import ScreenCaptureKit
import CoreImage
import AppKit

internal final class ScreenCaptureKitService: ScreenCaptureService, @unchecked Sendable {
    func captureActiveDisplay() async throws -> Data {
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw ScreenCaptureError.permissionDenied
        }
        let mouse = NSEvent.mouseLocation
        let display = content.displays.first(where: { display in
            let frame = CGRect(x: CGFloat(display.frame.origin.x), y: CGFloat(display.frame.origin.y),
                               width: CGFloat(display.width), height: CGFloat(display.height))
            return frame.contains(mouse)
        }) ?? content.displays.first
        guard let display else { throw ScreenCaptureError.noActiveDisplay }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.width = display.width
        cfg.height = display.height
        cfg.showsCursor = false
        do {
            let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
            let rep = NSBitmapImageRep(cgImage: cgImage)
            guard let png = rep.representation(using: .png, properties: [:]) else {
                throw ScreenCaptureError.captureFailed("png encode failed")
            }
            return png
        } catch let e as ScreenCaptureError {
            throw e
        } catch {
            throw ScreenCaptureError.captureFailed(String(describing: error))
        }
    }
}
```

- [ ] **Step 11.3: Null wrapper**

```swift
internal struct NullScreenCaptureService: ScreenCaptureService {
    let data: Data
    let error: ScreenCaptureError?
    func captureActiveDisplay() async throws -> Data {
        if let error { throw error }
        return data
    }
}
```

- [ ] **Step 11.4: Commit**

```bash
git commit -m "feat(infra): ScreenCaptureService (ScreenCaptureKit) + null"
```

---

## Task 12 — `HotkeyRegistrar` (KeyboardShortcuts library)

**Files:**

- Create: `Hotkey/HotkeyRegistrar.swift`
- Create: `Hotkey/KeyboardShortcutsRegistrar.swift`
- Create: `Hotkey/NullHotkeyRegistrar.swift`

- [ ] **Step 12.1: Protocol + name registry**

```swift
import Foundation
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    public static let openPanel = Self("openPanel", default: .init(.space, modifiers: [.command, .shift]))
}

public protocol HotkeyRegistrar: Sendable {
    func registerOpenPanel(handler: @escaping @Sendable () -> Void) async
    func unregisterAll() async
}

public enum HotkeyRegistrarFactory {
    public static func makeLive() -> HotkeyRegistrar { KeyboardShortcutsRegistrar() }
    public static func makeNull() -> ScriptedHotkeyRegistrar { ScriptedHotkeyRegistrar() }
}
```

- [ ] **Step 12.2: Live wrapper**

```swift
import KeyboardShortcuts

internal final class KeyboardShortcutsRegistrar: HotkeyRegistrar, @unchecked Sendable {
    func registerOpenPanel(handler: @escaping @Sendable () -> Void) async {
        await MainActor.run {
            KeyboardShortcuts.onKeyDown(for: .openPanel) { handler() }
        }
    }
    func unregisterAll() async {
        await MainActor.run { KeyboardShortcuts.removeAllHandlers() }
    }
}
```

- [ ] **Step 12.3: Null + scripted**

```swift
public actor ScriptedHotkeyRegistrar: HotkeyRegistrar {
    private var handler: (@Sendable () -> Void)?
    public func registerOpenPanel(handler: @escaping @Sendable () -> Void) async { self.handler = handler }
    public func unregisterAll() async { handler = nil }
    public func fire() async { handler?() }
}
```

- [ ] **Step 12.4: Commit**

```bash
git commit -m "feat(infra): HotkeyRegistrar wrapping KeyboardShortcuts + scripted null"
```

---

## Task 13 — `DeviceCapabilities` and `Logger`

**Files:**

- Create: `Permissions/DeviceCapabilities.swift`
- Create: `Logging/Logger.swift`
- Test: `Tests/GotItInfraTests/DeviceCapabilitiesTests.swift`

- [ ] **Step 13.1: Failing test**

```swift
@Suite struct DeviceCapabilitiesTests {
    @Test func reflectsScriptedPermissions() async {
        let probe = ScriptedCapabilityProbe()
        await probe.set(screenRecording: false, vaultFolder: false)
        let caps = DeviceCapabilities(probe: probe)
        await caps.reprobe()
        let snapshot = await caps.snapshot
        #expect(snapshot.screenRecording == false)
        #expect(snapshot.vaultFolder == false)
        await probe.set(screenRecording: true, vaultFolder: true)
        await caps.reprobe()
        let after = await caps.snapshot
        #expect(after.screenRecording)
        #expect(after.vaultFolder)
    }
}
```

- [ ] **Step 13.2: Implement**

```swift
import Foundation
import AppKit

public struct CapabilitiesSnapshot: Sendable, Equatable {
    public let screenRecording: Bool
    public let vaultFolder: Bool
    public let displaysCount: Int
    public init(screenRecording: Bool, vaultFolder: Bool, displaysCount: Int) {
        self.screenRecording = screenRecording; self.vaultFolder = vaultFolder; self.displaysCount = displaysCount
    }
}

public protocol CapabilityProbe: Sendable {
    func probe() async -> CapabilitiesSnapshot
}

public actor DeviceCapabilities {
    public private(set) var snapshot: CapabilitiesSnapshot
    private let probeImpl: CapabilityProbe
    public init(probe: CapabilityProbe) {
        self.probeImpl = probe
        self.snapshot = CapabilitiesSnapshot(screenRecording: false, vaultFolder: false, displaysCount: 0)
    }
    @discardableResult public func reprobe() async -> CapabilitiesSnapshot {
        snapshot = await probeImpl.probe()
        return snapshot
    }
}

public actor ScriptedCapabilityProbe: CapabilityProbe {
    private var screenRecording = false
    private var vaultFolder = false
    private var displaysCount = 1
    public init() {}
    public func set(screenRecording: Bool? = nil, vaultFolder: Bool? = nil, displaysCount: Int? = nil) {
        if let s = screenRecording { self.screenRecording = s }
        if let v = vaultFolder { self.vaultFolder = v }
        if let d = displaysCount { self.displaysCount = d }
    }
    public func probe() async -> CapabilitiesSnapshot {
        CapabilitiesSnapshot(screenRecording: screenRecording, vaultFolder: vaultFolder, displaysCount: displaysCount)
    }
}

public struct LiveCapabilityProbe: CapabilityProbe {
    public let bookmarkStore: SecureBookmarkStore
    public init(bookmarkStore: SecureBookmarkStore) { self.bookmarkStore = bookmarkStore }

    public func probe() async -> CapabilitiesSnapshot {
        // Screen Recording: CGPreflightScreenCaptureAccess is the documented modern probe.
        let screen = CGPreflightScreenCaptureAccess()
        let vault = bookmarkStore.tryResolve() != nil
        let displays = NSScreen.screens.count
        return CapabilitiesSnapshot(screenRecording: screen, vaultFolder: vault, displaysCount: displays)
    }
}
```

- [ ] **Step 13.3: `Logger.swift`**

```swift
import Foundation
import os

public enum Log {
    public static let panel = Logger(subsystem: "dev.gotit.macos", category: "panel")
    public static let api = Logger(subsystem: "dev.gotit.macos", category: "api")
    public static let capture = Logger(subsystem: "dev.gotit.macos", category: "capture")
    public static let save = Logger(subsystem: "dev.gotit.macos", category: "save")
}
```

- [ ] **Step 13.4: Run all infra tests, commit**

```bash
swift test --package-path apps/macos/Packages/GotItInfra
git commit -am "feat(infra): DeviceCapabilities + Logger"
```

---

## Task 14 — `GotItUI`: PanelEvents + ChatViewModel (text round-trip)

**Files:**

- Create: `Sources/GotItUI/ViewModels/PanelEvents.swift`
- Create: `Sources/GotItUI/ViewModels/ChatViewModel.swift`
- Test: `Tests/GotItUITests/ChatViewModelTests.swift`

- [ ] **Step 14.1: Failing test**

```swift
import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite struct ChatViewModelTests {
    @Test func sendsTextAndAppendsAssistant() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .chat: ChatResponse(
                messageID: "u1",
                assistantMessage: AssistantPayload(id: "a1", sessionID: "s1", text: "hi back", createdAt: "now")
            ),
        ])
        let vm = ChatViewModel(api: api, monitor: OfflineMonitorFactory.makeNull())
        await vm.send(text: "hi")
        #expect(vm.messages.count == 2)
        guard case .userText(let u) = vm.messages[0], case .assistant(let a) = vm.messages[1] else {
            Issue.record("wrong shape"); return
        }
        #expect(u.text == "hi")
        #expect(a.text == "hi back")
    }

    @Test func surfacesUnauthorizedAsReconnectRequired() async {
        let api = APIClientFactory.makeNull(failures: [.chat: .unauthorized])
        let vm = ChatViewModel(api: api, monitor: OfflineMonitorFactory.makeNull())
        await vm.send(text: "hi")
        #expect(vm.lastEvent == .reconnectRequired)
    }
}
```

- [ ] **Step 14.2: Implement events + view model**

```swift
import Foundation
import GotItModels
import GotItInfra

public enum PanelEvent: Equatable, Sendable {
    case toast(String)
    case error(String)
    case reconnectRequired
    case offlineChanged(Bool)
    case savedTo(URL)
    case permissionRequired(PermissionKind)
}

public enum PermissionKind: String, Equatable, Sendable {
    case screenRecording, vaultFolder
}

@MainActor
public final class ChatViewModel: ObservableObject {
    @Published public var messages: [Message] = []
    @Published public var lastEvent: PanelEvent?
    @Published public var isSending = false

    private let api: APIClient
    private let monitor: OfflineMonitor

    public init(api: APIClient, monitor: OfflineMonitor) {
        self.api = api; self.monitor = monitor
    }

    public func send(text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSending = true
        defer { isSending = false }

        if await monitor.isOnline == false { lastEvent = .offlineChanged(false); return }
        do {
            let resp: ChatResponse = try await api.send(.chat(text: trimmed, source: .text))
            // Optimistic local user message — backend has authoritative IDs but we don't have a session id yet.
            let now = ISO8601DateFormatter().string(from: Date())
            messages.append(.userText(.init(id: resp.messageID, sessionID: resp.assistantMessage.sessionID, text: trimmed, source: .text, createdAt: now)))
            messages.append(.assistant(resp.assistantMessage))
        } catch APIError.unauthorized {
            lastEvent = .reconnectRequired
        } catch APIError.offline {
            lastEvent = .offlineChanged(false)
        } catch {
            lastEvent = .error(String(describing: error))
        }
    }

    public func loadActive() async {
        do {
            let r: ActiveSessionResponse = try await api.send(.sessionsActive)
            messages = r.messagesTail
        } catch { /* tolerated — empty state */ }
    }

    public func reset() async {
        do {
            _ = try await api.send(.sessionsCreate) as CreateSessionResponse
            messages = []
        } catch APIError.unauthorized { lastEvent = .reconnectRequired }
        catch { lastEvent = .error(String(describing: error)) }
    }
}
```

- [ ] **Step 14.3: Run, PASS, commit**

```bash
swift test --package-path apps/macos/Packages/GotItUI
git commit -am "feat(ui): ChatViewModel with send/reset/loadActive against null infra"
```

---

## Task 15 — `PanelViewModel`: capture, look-again, save, offline coordination

**Files:**

- Create: `Sources/GotItUI/ViewModels/PanelViewModel.swift`
- Test: `Tests/GotItUITests/PanelViewModelTests.swift`
- Test: `Tests/GotItUITests/SaveFlowTests.swift`
- Test: `Tests/GotItUITests/OfflineStateTests.swift`

- [ ] **Step 15.1: Failing test — Look again happy path**

```swift
@Suite struct PanelViewModelTests {
    @Test func lookAgainSendsCaptureAndAppendsResults() async throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47]) // not real PNG; fine for the null
        let capture = ScreenCaptureServiceFactory.makeNull(returning: png)
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m1",
                analysis: AnalysisResult(rawText: "hi", urls: [], regions: [], contextKind: .browser_article, summary: "hello world"),
                assistantMessage: AssistantPayload(id: "a1", sessionID: "s1", text: "looking", createdAt: "now")
            ),
        ])
        let vm = makeVM(api: api, capture: capture)
        await vm.lookAgain()
        #expect(vm.chat.messages.count == 1) // we don't synthesize the user-text on the client; backend appends it
        guard case .assistant(let a) = vm.chat.messages.last else { Issue.record("no assistant"); return }
        #expect(a.text == "looking")
    }

    @Test func lookAgainSurfacesPermissionDenied() async {
        let capture = ScreenCaptureServiceFactory.makeNull(failsWith: .permissionDenied)
        let api = APIClientFactory.makeNull()
        let vm = makeVM(api: api, capture: capture)
        await vm.lookAgain()
        #expect(vm.events.last == .permissionRequired(.screenRecording))
    }
}

func makeVM(api: APIClient,
            capture: ScreenCaptureService = ScreenCaptureServiceFactory.makeNull(),
            writer: MarkdownFileWriter = MarkdownFileWriterFactory.makeNull(),
            bookmark: SecureBookmarkStore = SecureBookmarkStoreFactory.makeNull(),
            monitor: OfflineMonitor = OfflineMonitorFactory.makeNull()) -> PanelViewModel {
    PanelViewModel(
        api: api, capture: capture, writer: writer, bookmark: bookmark, monitor: monitor,
        chat: ChatViewModel(api: api, monitor: monitor)
    )
}
```

- [ ] **Step 15.2: Implement**

```swift
import Foundation
import GotItModels
import GotItInfra

@MainActor
public final class PanelViewModel: ObservableObject {
    @Published public var events: [PanelEvent] = []
    @Published public var isWorking = false
    public let chat: ChatViewModel

    private let api: APIClient
    private let capture: ScreenCaptureService
    private let writer: MarkdownFileWriter
    private let bookmark: SecureBookmarkStore
    private let monitor: OfflineMonitor

    public init(api: APIClient,
                capture: ScreenCaptureService,
                writer: MarkdownFileWriter,
                bookmark: SecureBookmarkStore,
                monitor: OfflineMonitor,
                chat: ChatViewModel) {
        self.api = api; self.capture = capture; self.writer = writer
        self.bookmark = bookmark; self.monitor = monitor; self.chat = chat
    }

    public func lookAgain() async {
        isWorking = true; defer { isWorking = false }
        let png: Data
        do { png = try await capture.captureActiveDisplay() }
        catch ScreenCaptureError.permissionDenied {
            events.append(.permissionRequired(.screenRecording)); return
        } catch {
            events.append(.error(String(describing: error))); return
        }
        await sendCapture(image: png, source: .refresh)
    }

    public func sendCapture(image: Data, source: CaptureSourceWire) async {
        if await monitor.isOnline == false { events.append(.offlineChanged(false)); return }
        do {
            let r: CaptureResponse = try await api.send(.capture(image: image, source: source))
            chat.messages.append(.assistant(r.assistantMessage))
        } catch APIError.unauthorized { events.append(.reconnectRequired) }
        catch { events.append(.error(String(describing: error))) }
    }

    public func save(instruction: String?) async {
        isWorking = true; defer { isWorking = false }

        // Resolve vault folder; trigger picker if missing.
        guard let resolved = bookmark.tryResolve() else {
            events.append(.permissionRequired(.vaultFolder)); return
        }
        defer { resolved.stopAccess() }

        let draft: SaveDraftResponse
        do {
            draft = try await api.send(.save(instruction: instruction))
        } catch APIError.unauthorized { events.append(.reconnectRequired); return }
        catch { events.append(.error(String(describing: error))); return }

        do {
            let final = try await writer.write(folder: resolved.url, relativePath: draft.vaultRelativePath, markdown: draft.markdown)
            events.append(.savedTo(final))
        } catch {
            events.append(.error("save failed: \(error)"))
        }
    }
}
```

- [ ] **Step 15.3: `SaveFlowTests.swift` — end-to-end Save with tmp dir + null infra**

```swift
@Suite struct SaveFlowTests {
    @Test func savesMarkdownToVaultAndReportsDelivery() async throws {
        let tmp = try makeTempDir(); defer { try? FileManager.default.removeItem(at: tmp) }
        let bookmark = SecureBookmarkStoreFactory.makeNull(tmp)
        let writer = MarkdownFileWriterFactory.makeLive() // real writer to real tmp dir
        let api = APIClientFactory.makeNull(responses: [
            .save: SaveDraftResponse(vaultRelativePath: "GotIt!/x.md", markdown: "# hi", saveRecordID: "sr1"),
        ])
        let vm = makeVM(api: api, writer: writer, bookmark: bookmark)
        await vm.save(instruction: nil)
        // assert toast event
        guard case .savedTo(let url) = vm.events.last else { Issue.record("no savedTo event"); return }
        #expect((try? String(contentsOf: url, encoding: .utf8)) == "# hi")
    }
}
```

- [ ] **Step 15.4: `OfflineStateTests.swift`**

```swift
@Suite struct OfflineStateTests {
    @Test func writeBlockedWhenOffline() async {
        let monitor = OfflineMonitorFactory.makeNull(initial: false)
        let api = APIClientFactory.makeNull()
        let vm = makeVM(api: api, monitor: monitor)
        await vm.sendCapture(image: Data([0x00]), source: .invoke)
        #expect(vm.events.contains(.offlineChanged(false)))
    }
}
```

- [ ] **Step 15.5: Run, PASS, commit**

```bash
swift test --package-path apps/macos/Packages/GotItUI
git commit -am "feat(ui): PanelViewModel — lookAgain, save, offline coordination + tests"
```

---

## Task 16 — `SettingsViewModel`

**Files:**

- Create: `ViewModels/SettingsViewModel.swift`
- Test: `Tests/GotItUITests/SettingsViewModelTests.swift`

- [ ] **Step 16.1: Failing test**

```swift
@Suite struct SettingsViewModelTests {
    @Test func updatesBackendURLAndPersists() {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let vm = SettingsViewModel(defaults: defaults, defaultBackendURL: URL(string: "http://localhost:3000")!)
        #expect(vm.backendURL.absoluteString == "http://localhost:3000")
        vm.setBackendURL(URL(string: "https://api.example.com")!)
        #expect(defaults.string(forKey: "GotItBackendURL") == "https://api.example.com")
    }

    @Test func chooseVaultFolderInvokesBookmarkStore() throws {
        let tmp = try makeTempDir(); defer { try? FileManager.default.removeItem(at: tmp) }
        let store = SecureBookmarkStoreFactory.makeNull()
        let vm = SettingsViewModel(defaults: UserDefaults(suiteName: "t-\(UUID())")!,
                                   defaultBackendURL: URL(string: "http://localhost:3000")!,
                                   bookmarkStore: store)
        try vm.chooseVaultFolder(tmp)
        #expect(vm.vaultFolder == tmp)
    }
}
```

- [ ] **Step 16.2: Implement**

```swift
import Foundation
import GotItInfra

@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public var backendURL: URL
    @Published public private(set) var vaultFolder: URL?

    private let defaults: UserDefaults
    private let bookmarkStore: SecureBookmarkStore

    public init(defaults: UserDefaults,
                defaultBackendURL: URL,
                bookmarkStore: SecureBookmarkStore = SecureBookmarkStoreFactory.makeNull()) {
        self.defaults = defaults
        self.bookmarkStore = bookmarkStore
        if let s = defaults.string(forKey: "GotItBackendURL"), let u = URL(string: s) {
            self.backendURL = u
        } else {
            self.backendURL = defaultBackendURL
        }
        self.vaultFolder = bookmarkStore.tryResolve()?.url
    }

    public func setBackendURL(_ url: URL) {
        backendURL = url
        defaults.set(url.absoluteString, forKey: "GotItBackendURL")
    }

    public func chooseVaultFolder(_ url: URL) throws {
        try bookmarkStore.save(folder: url)
        vaultFolder = url
    }
}
```

- [ ] **Step 16.3: Commit**

```bash
git commit -am "feat(ui): SettingsViewModel"
```

---

## Task 17 — SwiftUI views: ChatView, MessageRow, InputBar, OfflineBanner, ToastView

**Files:**

- Create: `Sources/GotItUI/Chat/ChatView.swift`
- Create: `Sources/GotItUI/Chat/MessageRow.swift`
- Create: `Sources/GotItUI/Chat/InputBar.swift`
- Create: `Sources/GotItUI/Common/OfflineBanner.swift`
- Create: `Sources/GotItUI/Common/ToastView.swift`
- Create: `Sources/GotItUI/Common/PermissionPrompt.swift`

These are pure SwiftUI views. No tests beyond view-model tests above; manual smoke covers visuals. Per spec §11.2 view-model coverage suffices for Phase 1a; snapshot/`ViewInspector` tests are an optional extension if time permits — **not required** for the sprint contract gate.

- [ ] **Step 17.1: `MessageRow.swift`**

```swift
import SwiftUI
import GotItModels

public struct MessageRow: View {
    let message: Message
    public init(_ message: Message) { self.message = message }
    public var body: some View {
        switch message {
        case .userText(let p): bubble(text: p.text, role: .user)
        case .assistant(let p): bubble(text: p.text, role: .assistant)
        case .screenCapture(let p): bubble(text: "📷 " + p.analysis.summary, role: .assistant)
        case .saveRecord(let p): bubble(text: "💾 saved: " + p.vaultPath, role: .assistant)
        }
    }
    private enum Role { case user, assistant }
    private func bubble(text: String, role: Role) -> some View {
        HStack {
            if role == .user { Spacer(minLength: 24) }
            Text(text)
                .padding(8)
                .background(role == .user ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if role == .assistant { Spacer(minLength: 24) }
        }
    }
}
```

- [ ] **Step 17.2: `InputBar.swift`** (text field + 📎 + Look again + Save + Reset, mic/listen hidden per spec §6.2)

```swift
import SwiftUI

public struct InputBar: View {
    @Binding var text: String
    let onSend: () -> Void
    let onAttach: () -> Void
    let onLookAgain: () -> Void
    let onSave: () -> Void
    let onReset: () -> Void
    let isBusy: Bool

    public init(text: Binding<String>, onSend: @escaping () -> Void, onAttach: @escaping () -> Void,
                onLookAgain: @escaping () -> Void, onSave: @escaping () -> Void, onReset: @escaping () -> Void, isBusy: Bool) {
        self._text = text; self.onSend = onSend; self.onAttach = onAttach; self.onLookAgain = onLookAgain
        self.onSave = onSave; self.onReset = onReset; self.isBusy = isBusy
    }

    public var body: some View {
        HStack(spacing: 8) {
            TextField("Ask anything…", text: $text)
                .textFieldStyle(.roundedBorder)
                .onSubmit(onSend)
                .disabled(isBusy)
            Button(action: onAttach) { Image(systemName: "paperclip") }.disabled(isBusy)
            Divider().frame(height: 18)
            Button("Look again", action: onLookAgain).disabled(isBusy)
            Button("Save", action: onSave).disabled(isBusy)
            Button("Reset", action: onReset).disabled(isBusy)
        }
        .padding(8)
    }
}
```

- [ ] **Step 17.3: `OfflineBanner.swift`**

```swift
import SwiftUI

public struct OfflineBanner: View {
    public init() {}
    public var body: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text("You’re offline. Reconnect the backend to send.")
            Spacer()
        }
        .padding(8)
        .background(Color.orange.opacity(0.2))
    }
}
```

- [ ] **Step 17.4: `ToastView.swift` and `PermissionPrompt.swift`**

```swift
import SwiftUI

public struct ToastView: View {
    public let text: String
    public let onTap: (() -> Void)?
    public init(_ text: String, onTap: (() -> Void)? = nil) { self.text = text; self.onTap = onTap }
    public var body: some View {
        Text(text)
            .padding(8)
            .background(.thinMaterial)
            .clipShape(Capsule())
            .onTapGesture { onTap?() }
    }
}

public struct PermissionPrompt: View {
    public let title: String
    public let body: String
    public let cta: String
    public let action: () -> Void
    public init(title: String, body: String, cta: String, action: @escaping () -> Void) {
        self.title = title; self.body = body; self.cta = cta; self.action = action
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(body).font(.body)
            Button(cta, action: action)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 17.5: `ChatView.swift`**

```swift
import SwiftUI
import GotItModels
import GotItInfra

public struct ChatView: View {
    @ObservedObject var panel: PanelViewModel
    @State private var draft: String = ""
    @State private var isOnline: Bool = true

    public init(panel: PanelViewModel) { self.panel = panel }

    public var body: some View {
        VStack(spacing: 0) {
            if !isOnline { OfflineBanner() }
            ScrollView {
                LazyVStack(alignment: .leading) {
                    ForEach(Array(panel.chat.messages.enumerated()), id: \.offset) { _, m in
                        MessageRow(m)
                    }
                }
                .padding(8)
            }
            .frame(minHeight: 220)

            Divider()

            InputBar(
                text: $draft,
                onSend: { Task { await panel.chat.send(text: draft); draft = "" } },
                onAttach: { /* hooked in Task 22 */ },
                onLookAgain: { Task { await panel.lookAgain() } },
                onSave: { Task { await panel.save(instruction: nil) } },
                onReset: { Task { await panel.chat.reset() } },
                isBusy: panel.isWorking || panel.chat.isSending
            )
        }
        .frame(width: 460)
    }
}
```

- [ ] **Step 17.6: Build the package**

```bash
swift build --package-path apps/macos/Packages/GotItUI
```

PASS, commit:

```bash
git commit -am "feat(ui): SwiftUI ChatView, MessageRow, InputBar, OfflineBanner, ToastView"
```

---

## Task 18 — Floating panel host (`NSPanel` + `.nonactivatingPanel` + `.hudWindow`)

**Files:**

- Create: `Sources/GotItUI/Panel/FloatingPanel.swift`
- Create: `Sources/GotItUI/Panel/PanelHostingView.swift`

- [ ] **Step 18.1: `FloatingPanel.swift`**

```swift
import AppKit
import SwiftUI

public final class FloatingPanel: NSPanel {
    public init<Content: View>(rootView: Content) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 480),
            styleMask: [.nonactivatingPanel, .titled, .closable, .resizable, .fullSizeContentView, .hudWindow],
            backing: .buffered,
            defer: false
        )
        self.titleVisibility = .hidden
        self.titlebarAppearsTransparent = true
        self.isFloatingPanel = true
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        self.isReleasedWhenClosed = false
        self.hidesOnDeactivate = false
        self.contentView = NSHostingView(rootView: rootView)
    }

    public override var canBecomeKey: Bool { true }
    public override var canBecomeMain: Bool { false }

    public func toggle(near point: CGPoint? = nil) {
        if isVisible { orderOut(nil); return }
        if let point { setFrameTopLeftPoint(point) }
        else { centerInActiveScreen() }
        makeKeyAndOrderFront(nil)
    }

    private func centerInActiveScreen() {
        guard let screen = NSScreen.main else { return }
        let f = screen.visibleFrame
        let panelFrame = self.frame
        let x = f.midX - panelFrame.width / 2
        let y = f.midY - panelFrame.height / 2
        self.setFrame(NSRect(x: x, y: y, width: panelFrame.width, height: panelFrame.height), display: false)
    }
}
```

- [ ] **Step 18.2: `PanelHostingView.swift`** is just a thin SwiftUI shell around `ChatView` plus a permission/onboarding overlay swap. Skipped here — it wraps `ChatView(panel:)` and adds a `ZStack` with current event mapped to `ToastView` / `PermissionPrompt`.

```swift
import SwiftUI

public struct PanelHostingView: View {
    @ObservedObject var panel: PanelViewModel
    public init(panel: PanelViewModel) { self.panel = panel }

    public var body: some View {
        ZStack(alignment: .bottom) {
            ChatView(panel: panel)
            if let event = panel.events.last {
                switch event {
                case .toast(let text): ToastView(text).padding()
                case .savedTo(let url): ToastView("Saved to \(url.lastPathComponent)") {
                    NSWorkspace.shared.activateFileViewerSelecting([url])
                }.padding()
                case .reconnectRequired: PermissionPrompt(title: "Reconnect required.",
                    body: "Your device session expired.", cta: "Retry") { /* wired by app */ }
                    .padding()
                case .permissionRequired(.screenRecording):
                    PermissionPrompt(title: "Screen Recording needed",
                        body: "Look again needs Screen Recording permission.",
                        cta: "Open System Settings") {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                            NSWorkspace.shared.open(url)
                        }
                    }.padding()
                case .permissionRequired(.vaultFolder):
                    PermissionPrompt(title: "Choose your captures folder",
                        body: "GotIt! saves Markdown files into a folder you pick.",
                        cta: "Choose…") { /* wired by app */ }.padding()
                case .offlineChanged: EmptyView()
                case .error(let s): ToastView("Error: \(s)").padding()
                }
            }
        }
    }
}
```

- [ ] **Step 18.3: Commit**

```bash
git commit -am "feat(ui): FloatingPanel (NSPanel) + PanelHostingView"
```

---

## Task 19 — Settings window, vault picker, hotkey recorder, first-run welcome

**Files:**

- Create: `Sources/GotItUI/Settings/SettingsWindow.swift`
- Create: `Sources/GotItUI/Settings/VaultFolderPicker.swift`
- Create: `Sources/GotItUI/Settings/HotkeyRecorder.swift`
- Create: `Sources/GotItUI/Onboarding/FirstRunBackendStep.swift`

- [ ] **Step 19.1: `VaultFolderPicker.swift`** — wraps `NSOpenPanel`

```swift
import AppKit

public enum VaultFolderPicker {
    public static func choose() -> URL? {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canCreateDirectories = true
        p.canChooseFiles = false
        p.allowsMultipleSelection = false
        p.prompt = "Choose"
        p.title = "Choose your captures folder"
        return p.runModal() == .OK ? p.url : nil
    }
}
```

- [ ] **Step 19.2: `HotkeyRecorder.swift`**

```swift
import SwiftUI
import KeyboardShortcuts

public struct HotkeyRecorderView: View {
    public init() {}
    public var body: some View {
        Form {
            KeyboardShortcuts.Recorder("Open panel", name: .openPanel)
        }
        .padding()
        .frame(width: 320)
    }
}
```

- [ ] **Step 19.3: `SettingsWindow.swift`**

```swift
import SwiftUI

public struct SettingsView: View {
    @ObservedObject var settings: SettingsViewModel
    public init(settings: SettingsViewModel) { self.settings = settings }
    public var body: some View {
        TabView {
            generalTab.tabItem { Label("General", systemImage: "gear") }
            HotkeyRecorderView().tabItem { Label("Hotkeys", systemImage: "keyboard") }
        }
        .frame(width: 460, height: 280)
    }

    private var generalTab: some View {
        Form {
            TextField("Backend URL", text: Binding(
                get: { settings.backendURL.absoluteString },
                set: { if let u = URL(string: $0) { settings.setBackendURL(u) } }
            ))
            HStack {
                Text("Vault folder:")
                Text(settings.vaultFolder?.path ?? "— not chosen —").foregroundStyle(.secondary)
                Spacer()
                Button("Choose…") {
                    if let url = VaultFolderPicker.choose() { try? settings.chooseVaultFolder(url) }
                }
            }
        }
        .padding()
    }
}
```

- [ ] **Step 19.4: `FirstRunBackendStep.swift`**

```swift
import SwiftUI

public struct FirstRunBackendStep: View {
    @State private var url: String
    let defaultURL: URL
    let onConnect: (URL) -> Void
    let onSkip: () -> Void
    public init(defaultURL: URL, onConnect: @escaping (URL) -> Void, onSkip: @escaping () -> Void) {
        self.defaultURL = defaultURL; self._url = State(initialValue: defaultURL.absoluteString)
        self.onConnect = onConnect; self.onSkip = onSkip
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Welcome to GotIt!").font(.title2)
            Text("GotIt! captures your screen on demand and chats about what it sees.")
            TextField("Backend URL", text: $url)
            HStack {
                Button("Connect") { if let u = URL(string: url) { onConnect(u) } }
                    .keyboardShortcut(.defaultAction)
                Button("Try without backend", action: onSkip)
            }
        }
        .padding()
        .frame(width: 460)
    }
}
```

- [ ] **Step 19.5: Build + commit**

```bash
swift build --package-path apps/macos/Packages/GotItUI
git commit -am "feat(ui): SettingsWindow, VaultFolderPicker, HotkeyRecorder, FirstRunBackendStep"
```

---

## Task 20 — App target wiring: `AppConfig`, `AppDependencies`, `GotItApp`, `AppDelegate`

**Files:**

- Create: `apps/macos/App/AppConfig.swift`
- Create: `apps/macos/App/AppDependencies.swift`
- Create: `apps/macos/App/GotItApp.swift`
- Create: `apps/macos/App/AppDelegate.swift`

- [ ] **Step 20.1: `AppConfig.swift`**

```swift
import Foundation
import GotItInfra

public struct AppConfig: Sendable {
    public let backendURL: URL
    public let healthProbeTimeoutMs: Int
    public let installID: String
    public let keychainService: String
    public let keychainAccount: String

    public static func load(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> AppConfig {
        let infoURL = (bundle.object(forInfoDictionaryKey: "GotItBackendURL") as? String).flatMap(URL.init(string:))
        let overrideURL = (defaults.string(forKey: "GotItBackendURL")).flatMap(URL.init(string:))
        let backend = overrideURL ?? infoURL ?? URL(string: "http://localhost:3000")!
        let timeout = (bundle.object(forInfoDictionaryKey: "GotItHealthProbeTimeoutMs") as? Int) ?? 1500

        let installStore = InstallIDStoreFactory.makeLive(defaults: defaults, key: "GotItInstallID")
        return AppConfig(
            backendURL: backend,
            healthProbeTimeoutMs: timeout,
            installID: installStore.get(),
            keychainService: "dev.gotit.macos",
            keychainAccount: "device_token"
        )
    }
}
```

Add the corresponding `Info.plist` keys (`GotItBackendURL`, `GotItHealthProbeTimeoutMs`) per sub-spec §6.

- [ ] **Step 20.2: `AppDependencies.swift` — single call site for `make…Live(…)`**

```swift
import Foundation
import GotItInfra
import GotItUI

@MainActor
public final class AppDependencies: ObservableObject {
    public let config: AppConfig
    public let api: APIClient
    public let monitor: OfflineMonitor
    public let capture: ScreenCaptureService
    public let writer: MarkdownFileWriter
    public let bookmark: SecureBookmarkStore
    public let watcher: ScreenshotWatcher
    public let hotkeys: HotkeyRegistrar
    public let capabilities: DeviceCapabilities
    public let settings: SettingsViewModel
    public let panel: PanelViewModel

    public init(config: AppConfig) {
        self.config = config
        let keychain = KeychainStoreFactory.makeLive(service: config.keychainService, account: config.keychainAccount)
        let bookmark = SecureBookmarkStoreFactory.makeLive()
        self.bookmark = bookmark
        self.api = APIClientFactory.makeLive(baseURL: config.backendURL, keychain: keychain, installID: config.installID)
        self.monitor = OfflineMonitorFactory.makeLive(baseURL: config.backendURL, timeoutMs: config.healthProbeTimeoutMs)
        self.capture = ScreenCaptureServiceFactory.makeLive()
        self.writer = MarkdownFileWriterFactory.makeLive()
        self.watcher = ScreenshotWatcherFactory.makeLive()
        self.hotkeys = HotkeyRegistrarFactory.makeLive()
        self.capabilities = DeviceCapabilities(probe: LiveCapabilityProbe(bookmarkStore: bookmark))
        self.settings = SettingsViewModel(
            defaults: .standard,
            defaultBackendURL: config.backendURL,
            bookmarkStore: bookmark
        )
        let chat = ChatViewModel(api: api, monitor: monitor)
        self.panel = PanelViewModel(
            api: api, capture: capture, writer: writer, bookmark: bookmark, monitor: monitor, chat: chat
        )
    }
}
```

- [ ] **Step 20.3: `GotItApp.swift` and `AppDelegate.swift`**

```swift
// GotItApp.swift
import SwiftUI

@main
struct GotItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        Settings {
            SettingsView(settings: delegate.deps.settings)
        }
    }
}
```

```swift
// AppDelegate.swift
import AppKit
import SwiftUI
import GotItInfra
import GotItUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let deps: AppDependencies = AppDependencies(config: AppConfig.load())
    private var statusItem: NSStatusItem?
    private var panelWindow: FloatingPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installStatusItem()
        installPanel()
        Task { await deps.hotkeys.registerOpenPanel { [weak self] in self?.togglePanel() } }
        Task { await deps.watcher.start(); await consumeScreenshots() }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { await self?.deps.capabilities.reprobe() }
        }
    }

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "GotIt!"
        item.button?.target = self
        item.button?.action = #selector(togglePanel)
        statusItem = item
    }

    private func installPanel() {
        let host = PanelHostingView(panel: deps.panel)
        panelWindow = FloatingPanel(rootView: host.environmentObject(deps))
    }

    @objc private func togglePanel() {
        panelWindow?.toggle()
    }

    private func consumeScreenshots() async {
        for await event in deps.watcher.events() {
            do {
                let data = try Data(contentsOf: event.fileURL)
                await deps.panel.sendCapture(image: data, source: .screenshot)
            } catch {
                Log.capture.error("screenshot read failed: \(String(describing: error))")
            }
        }
    }
}
```

- [ ] **Step 20.4: Build the app**

```bash
xcodebuild build -scheme GotIt -destination "platform=macOS" -quiet
```

Expect: `** BUILD SUCCEEDED **`. Run from Xcode (`Cmd+R`); status bar item appears; `Cmd+Shift+Space` toggles the panel.

- [ ] **Step 20.5: Commit**

```bash
git commit -am "feat(macos): app target — AppConfig, DI root, AppDelegate, status item, hotkey, screenshot watcher"
```

---

## Task 21 — `pnpm test:macos` script + Husky pre-push gate

**Files:**

- Modify: root `package.json`
- Modify: `.husky/pre-push`

- [ ] **Step 21.1: Add the script**

In root `package.json`:

```json
{
  "scripts": {
    "test:macos": "xcodebuild -scheme GotIt -destination 'platform=macOS' -workspace apps/macos/GotIt.xcworkspace test -quiet"
  }
}
```

If the project is project-only (no workspace), use `-project apps/macos/GotIt.xcodeproj` instead.

- [ ] **Step 21.2: Update `.husky/pre-push`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

set -e

pnpm typecheck
pnpm lint
pnpm test
pnpm purity-check

# Only run macOS tests when apps/macos changed since the upstream branch.
if git diff --name-only @{push}...HEAD 2>/dev/null | grep -q '^apps/macos/'; then
  pnpm test:macos
fi
```

- [ ] **Step 21.3: Verify**

```bash
pnpm test:macos
```

Expect: all `GotItModels`, `GotItInfra`, `GotItUI`, and `GotItUITests` targets run via `xcodebuild`. PASS.

- [ ] **Step 21.4: Commit**

```bash
git commit -am "chore: add pnpm test:macos and gate it in pre-push when apps/macos changes"
```

---

## Task 22 — Drag-drop, paste, and 📎 attach paths

**Files:**

- Modify: `Sources/GotItUI/Chat/ChatView.swift`
- Modify: `Sources/GotItUI/Chat/InputBar.swift`
- (no new tests — covered by manual smoke #3, #4, #5)

- [ ] **Step 22.1: Drag-drop**

Wrap `ChatView`'s root `VStack` in `.onDrop(of: [.image, .png, .jpeg, .heic, .gif, .webp], isTargeted: nil) { providers in … }`. Inside the closure, ask each provider for `Data` of the matching UTI and call `panel.sendCapture(image:, source: .invoke)`.

- [ ] **Step 22.2: Paste**

Add `.onCommand(#selector(NSStandardKeyBindingResponding.paste(_:)))` (or a SwiftUI `keyboardShortcut("v", modifiers: .command)` action on a hidden button) that reads `NSPasteboard.general` for image data. If data exists, call `sendCapture(image:source:.invoke)`.

- [ ] **Step 22.3: 📎 attach**

Wire `onAttach` in `ChatView` to:

```swift
let panel = NSOpenPanel()
panel.allowedContentTypes = [.png, .jpeg, .heic, .gif, .webP]
panel.allowsMultipleSelection = false
if panel.runModal() == .OK, let url = panel.url, let data = try? Data(contentsOf: url) {
    Task { await self.panel.sendCapture(image: data, source: .invoke) }
}
```

- [ ] **Step 22.4: Build + commit**

```bash
xcodebuild build -scheme GotIt -destination "platform=macOS" -quiet
git commit -am "feat(ui): drag-drop, ⌘V paste, and paperclip image attach paths"
```

---

## Task 23 — Screenshot grace toast + cancel window

**Files:**

- Modify: `Sources/GotItUI/ViewModels/PanelViewModel.swift`

The watcher emits a `ScreenshotEvent`. The view model schedules an auto-send after `GotItScreenshotGraceSeconds` (default 3); the toast shows a Cancel that flips a `pending` flag and the auto-send checks it.

- [ ] **Step 23.1: Failing test**

```swift
@Test func screenshotEventTriggersGraceWindowThenSends() async throws {
    let api = APIClientFactory.makeNull(responses: [
        .capture: CaptureResponse(messageID: "m", analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: "x"),
                                   assistantMessage: .init(id: "a", sessionID: "s", text: "ok", createdAt: "now"))
    ])
    let vm = makeVM(api: api)
    let url = try writeTempPNG()
    await vm.handleScreenshot(at: url, graceSeconds: 0) // immediate
    #expect(vm.chat.messages.count == 1)
}

@Test func cancelDuringGraceSuppressesSend() async throws {
    let api = APIClientFactory.makeNull(responses: [
        .capture: CaptureResponse(messageID: "m", analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: "x"),
                                   assistantMessage: .init(id: "a", sessionID: "s", text: "ok", createdAt: "now"))
    ])
    let vm = makeVM(api: api)
    let url = try writeTempPNG()
    let task = Task { await vm.handleScreenshot(at: url, graceSeconds: 0.5) }
    await vm.cancelPendingScreenshot()
    await task.value
    #expect(vm.chat.messages.isEmpty)
}
```

- [ ] **Step 23.2: Implement**

```swift
extension PanelViewModel {
    public func handleScreenshot(at url: URL, graceSeconds: Double) async {
        events.append(.toast("Screenshot captured — sending to GotIt!"))
        pendingScreenshot = url
        if graceSeconds > 0 {
            try? await Task.sleep(nanoseconds: UInt64(graceSeconds * 1_000_000_000))
        }
        guard pendingScreenshot == url else { return }
        pendingScreenshot = nil
        guard let data = try? Data(contentsOf: url) else { return }
        await sendCapture(image: data, source: .screenshot)
    }

    public func cancelPendingScreenshot() async { pendingScreenshot = nil }
}
```

Add `@Published private var pendingScreenshot: URL?` to the class.

- [ ] **Step 23.3: Wire into `AppDelegate.consumeScreenshots`**

```swift
for await event in deps.watcher.events() {
    await deps.panel.handleScreenshot(at: event.fileURL, graceSeconds: 3)
}
```

- [ ] **Step 23.4: Run, PASS, commit**

```bash
swift test --package-path apps/macos/Packages/GotItUI
git commit -am "feat(ui): screenshot grace toast with 3s cancel window"
```

---

## Task 24 — XCUITest smoke

**Files:**

- Create: `apps/macos/GotItUITests/PanelSmokeTests.swift`

This is one happy-path UI test. It runs against a real backend (`localhost:3000`) prepared by the developer; in CI it is skipped.

- [ ] **Step 24.1: Skeleton**

```swift
import XCTest

final class PanelSmokeTests: XCTestCase {
    func testHotkeyOpensPanelAndSendsHello() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["GOTIT_BACKEND_LIVE"] == "1",
                          "skipped unless GOTIT_BACKEND_LIVE=1 (developer runs backend separately)")
        let app = XCUIApplication()
        app.launchEnvironment["GotItBackendURL"] = "http://localhost:3000"
        app.launch()

        // Hotkey synthesis is unreliable in XCUITest; instead poke the status item.
        let menuBar = XCUIApplication(bundleIdentifier: "com.apple.controlcenter").menuBars.firstMatch
        // Click the status item by description — title set to "GotIt!" in AppDelegate.
        // Implementation note: this is the first manual-smoke flow; XCUI is best-effort here.
        menuBar.statusItems["GotIt!"].click()

        let textField = app.textFields["Ask anything…"]
        XCTAssertTrue(textField.waitForExistence(timeout: 3))
        textField.typeText("hi\n")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'hi'")).firstMatch.waitForExistence(timeout: 5))
    }
}
```

If hotkey synthesis is required and reliable on the developer's machine, swap the menu-bar click for `XCUIRemote.shared.press(.someKey)` or skip entirely — manual smoke #2 covers the hotkey flow.

- [ ] **Step 24.2: Commit**

```bash
git commit -am "test(macos): XCUITest smoke for hotkey + panel + text round-trip"
```

---

## Task 25 — Full validation pass + sprint contract checklist

**Files:** none new. This task confirms the sprint contract from sub-spec §12 + parent §16.1.

- [ ] **Step 25.1: TS side**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check
```

Expect: all green.

- [ ] **Step 25.2: macOS side**

```bash
pnpm test:macos
```

Expect: all SPM tests pass; XCUITest smoke skipped (no `GOTIT_BACKEND_LIVE=1`) or passes if the developer is running the backend.

- [ ] **Step 25.3: Module boundary check**

In Xcode, attempt to add `import URLSessionAPIClient` (the concrete) inside `GotItUI` — must fail to compile (it's `internal` to `GotItInfra`). Same for `SecKeychainStore`, `FileManagerMarkdownWriter`, `MetadataQueryScreenshotWatcher`. Document the attempt in the commit message.

- [ ] **Step 25.4: Spec terminology lint**

Confirm names match sub-spec §14:

```bash
rg -n 'VaultWriter|ObsidianWriter' apps/macos
```

Expect: zero hits in `apps/macos`. The wrapper is `MarkdownFileWriter`. Backend keeps its `obsidian-writer.ts` file only if Task 1.8 didn't prune it; Phase 1a does not export "Obsidian Vault" wording from the client surface.

- [ ] **Step 25.5: No hardcoded URLs/paths in source**

```bash
rg -n 'http://localhost' apps/macos/Sources apps/macos/Packages 2>/dev/null
```

Expect: zero hits in source. `AppConfig.swift` is the only place a default URL appears, and it's a fallback for when neither `Info.plist` nor `UserDefaults` provides one — this matches sub-spec §6's table.

- [ ] **Step 25.6: Manual smoke checklist (sub-spec §11.5)**

Run each of the 11 flows manually with the backend up, recording pass/fail. Re-run any failures after fixing. Capture short notes per item; the validator reads these.

- [ ] **Step 25.7: Pre-push gate**

```bash
git push --dry-run
```

Expect: Husky runs the full gate including `pnpm test:macos` (since `apps/macos/` changed).

- [ ] **Step 25.8: Final commit**

If the manual smoke surfaced any leftover bug fixes, commit them per fix, not lumped. Otherwise:

```bash
git commit --allow-empty -m "chore(macos): F001 Phase 1a Plan B sprint contract green"
```

---

## Self-Review Checklist

Run before declaring the plan ready for execution.

**1. Spec coverage:**

- §2 Scope (in/out/non-goals): Tasks 2, 3, 18, 22 cover menu-bar app shell, screenshot routing, drag/paste/attach, hotkey, panel, save, settings, JIT prompts, offline.
- §4 Architecture (3 SPM packages, factories, DI root): Task 2, 4, 6, 7, 14, 15, 20.
- §5 Functional core (resolveCollision): Task 7.
- §6 Configuration (AppConfig + UserDefaults boundary): Task 20.
- §7 Permissions & first-run: Tasks 13 (capabilities), 19 (welcome), 20 (reprobe on activate), 18 (permission prompts in PanelHostingView).
- §8.1 Hotkey: Task 12 + Task 20.
- §8.2 Screenshot routing: Tasks 10, 22, 23.
- §8.3 Save: Tasks 1, 7, 8, 15.
- §9 API + auth (typed router, 401 re-pair, retry, offline): Tasks 4, 5, 9.
- §10 BOARD/parent spec amendments: Task 1 covers the only Phase-1a-required backend amendment (`/save` returns draft). `/save/:id/result` is intentionally deferred to F013 — see Design Notes. The BOARD.md F013 entry is a docs-only change folded into Task 1's commit body.
- §11 Testing strategy: Tasks 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 16, 24.
- §12 Sprint contract: Task 25.
- §14 Terminology: covered everywhere; `MarkdownFileWriter`, `ScreenshotWatcher`, `HotkeyRegistrar`, `OfflineMonitor`, `DeviceCapabilities`, `SecureBookmarkStore`, `AppDependencies`, `AppConfig`, `APIClient`/`Endpoint`.

**2. Placeholder scan:** every code-producing step has actual code. The XCUITest task is the only spot that allows a fallback strategy; that's intentional given XCUITest hotkey-synthesis instability.

**3. Type consistency:** `Endpoint` is the same enum throughout Tasks 4, 5, 14, 15 (7 cases: device, health, sessionsActive, sessionsCreate, capture, chat, save). `APIClient.send` is generic over response. `Message` discriminator matches `kind` in `packages/shared`. `SaveDraftResponse` snake/camel mapping is consistent with the schema in Task 1. `CaptureSourceWire` matches `CaptureSource` in `packages/shared` (`screenshot|keybind|refresh|invoke`).

---

## Execution Handoff

**Plan complete and saved to `docs/plans/f001-phase-1a-macos-client.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batched with checkpoints.

**Which approach?**
