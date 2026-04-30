# F001 Phase 1a — macOS Client (Plan B) Spec

> Sub-spec for the macOS native client slice of F001 Phase 1a. This document is the source of truth for client-side design decisions for capture, panel UI, text chat, and Markdown save. The parent spec is `docs/specs/f001-screen-capture-mvp.md`. The backend slice is covered by `docs/plans/f001-phase-1a-backend.md` (completed and validated 2026-04-29, score 9.4/10).
>
> Phases 1b (mic), 1c (Listen), 1d (history) are **out of scope** here.

## 1. Goal

Ship the macOS-native imperative shell for the smallest end-to-end vertical of F001:

- Detect macOS-native screenshots and route them into a chat session.
- Provide a hotkey-summoned floating chat panel.
- Round-trip text chat against the backend.
- Re-capture the active display on demand ("Look again").
- Write a Markdown save file directly to a user-chosen vault folder.
- Handle offline mode, permission denial, device unavailability, and token revalidation per the parent spec's degraded-mode contract.

## 2. Scope

### 2.1 In scope (Phase 1a)

- Menu-bar-only macOS app shell (`LSUIElement = true`).
- Native screenshot detection via `NSMetadataQuery` (`kMDItemIsScreenCapture = 1`).
- Drag-and-drop, paste (⌘V), and paperclip-attach paths into the panel.
- One-shot screen capture via `ScreenCaptureKit` for "Look again".
- Floating `NSPanel` with `.nonactivatingPanel` + `.hudWindow` flags.
- Global hotkey `Cmd+Shift+Space` (default; user-rebindable) opens the panel.
- HTTPS round-trip with the backend over `URLSession` + a typed endpoint router.
- Bearer token storage in Keychain; transparent re-pair on 401.
- Markdown save to a user-chosen vault folder via `FileManager` + security-scoped bookmark.
- Settings window: backend URL, vault folder, hotkey rebind.
- JIT permission prompts (Screen Recording, vault folder), per-control disabled-with-tooltip fallback when capabilities are missing.
- Offline mode banner, write-action gating, no background polling, no replay queue.

### 2.2 Out of scope (deferred)

- Push-to-talk mic UI and AVAudioEngine wrapper (Phase 1b).
- Listen mode UI and ScreenCaptureKit audio wrapper (Phase 1c).
- History tab UI (Phase 1d).
- Real Obsidian plugin and SSE delivery (new feature, see §10).
- Stealth rendering integration with `NSWindow.sharingType` (F005; spec stub still added but no UX work).
- Custom system prompt UI (F004).
- Local model support, browser extension, Notion (F008–F010).

### 2.3 Non-goals

- Cross-platform abstractions for a future Windows client. The Swift code is macOS-specific. Reusable behavior already lives in the backend and `packages/core` per the parent spec.
- Real-time chat streaming. `POST /chat` returns the full assistant message in one body per parent spec §8.4.
- Background polling for any state.

## 3. Reference Documents

| Document                                | Role                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/f001-screen-capture-mvp.md` | Parent spec. Defines user flows, session semantics, API contracts, error rules. This sub-spec inherits everything not contradicted here. |
| `docs/plans/f001-phase-1a-backend.md`   | Backend plan (completed). API behavior is implemented and validated.                                                                     |
| `README.md`                             | Product positioning. Menu-bar-companion shape, screen-aware chat.                                                                        |
| `BOARD.md`                              | Feature backlog. Updated by this spec — see §10.                                                                                         |
| `STATUS.md`                             | Current sprint state. Will be updated by validator after Phase 1a Plan B completes.                                                      |
| `CLAUDE.md` / `AGENTS.md`               | Architecture rules, harness, quality pipeline, Husky gates.                                                                              |

## 4. Architecture

### 4.1 Layering

The macOS app is the imperative shell on its side of the wire. It follows the same Functional Core / Imperative Shell pattern enforced by the rest of the project (parent spec §4).

```
apps/macos
├── App target (thin)
│   ├── @main + AppDelegate, LSUIElement = true
│   ├── AppDependencies (DI root, `live` factory)
│   └── AppConfig (validated config struct)
└── Local SPM packages
    ├── GotItModels   (Codable mirrors of @got-it/shared)
    ├── GotItInfra    (protocols + URLSession + ScreenCaptureKit + FileManager + Keychain)
    └── GotItUI       (SwiftUI views, view models, panel host)
```

`GotItInfra` and `GotItUI` are independent SPM packages with explicit dependency declarations. Compiler-enforced module boundaries replace the convention-only boundaries the rest of the monorepo uses.

### 4.2 Module structure

```
apps/macos/
├── GotIt.xcodeproj                    # thin app target, signing, entitlements
├── App/
│   ├── GotItApp.swift                 # @main, NSApplicationDelegate
│   ├── AppDependencies.swift          # constructs and wires all packages (DI root)
│   ├── AppConfig.swift                # validated config struct (see §6)
│   └── Info.plist                     # LSUIElement=true, permission usage strings
├── Packages/
│   ├── GotItModels/
│   │   ├── Package.swift              # no deps
│   │   ├── Sources/GotItModels/
│   │   │   ├── Session.swift
│   │   │   ├── Message.swift
│   │   │   ├── AnalysisResult.swift
│   │   │   └── APIRequests.swift      # CaptureRequest, ChatRequest, SaveRequest, etc.
│   │   └── Tests/GotItModelsTests/    # round-trip Codable
│   ├── GotItInfra/
│   │   ├── Package.swift              # depends on GotItModels
│   │   ├── Sources/GotItInfra/
│   │   │   ├── API/                   # APIClient protocol, URLSessionAPIClient, Endpoints, APIError
│   │   │   ├── Capture/               # ScreenCaptureService (ScreenCaptureKit wrapper)
│   │   │   ├── Screenshot/            # ScreenshotWatcher (NSMetadataQuery wrapper)
│   │   │   ├── Hotkey/                # HotkeyRegistrar (KeyboardShortcuts wrapper)
│   │   │   ├── Files/                 # MarkdownFileWriter, ResolveCollision
│   │   │   ├── Bookmarks/             # SecureBookmarkStore
│   │   │   ├── Keychain/              # KeychainStore (device token), InstallIDStore
│   │   │   ├── Permissions/           # DeviceCapabilities
│   │   │   ├── Network/               # OfflineMonitor (/health probe)
│   │   │   └── Logging/               # Logger (os.Logger wrapper)
│   │   └── Tests/GotItInfraTests/     # nullable-driven unit tests
│   └── GotItUI/
│       ├── Package.swift              # depends on GotItModels + GotItInfra
│       ├── Sources/GotItUI/
│       │   ├── Panel/                 # FloatingPanel, PanelHostingView
│       │   ├── Chat/                  # ChatView, MessageRow, InputBar
│       │   ├── Settings/              # SettingsWindow, VaultFolderPicker, HotkeyRecorder
│       │   ├── Onboarding/            # FirstRunBackendStep
│       │   ├── Common/                # OfflineBanner, PermissionPrompt
│       │   └── ViewModels/            # PanelViewModel, ChatViewModel, SettingsViewModel
│       └── Tests/GotItUITests/        # view-model + snapshot tests
└── GotItUITests/                      # XCUITest smoke (one Phase 1a flow)
```

### 4.3 Boundary contract

- `GotItModels` exports DTOs only. No imports beyond `Foundation`. Pure value types.
- `GotItInfra` exports `public` protocols (`APIClient`, `ScreenCaptureService`, `HotkeyRegistrar`, `MarkdownFileWriter`, `KeychainStore`, `ScreenshotWatcher`, `DeviceCapabilities`, `OfflineMonitor`, `SecureBookmarkStore`) and factory enums (`APIClientFactory`, etc.) that expose `makeLive(...)` and `makeNull(...)` static funcs. All concrete classes are `internal`.
- `GotItUI` consumes only `GotItModels` types and `GotItInfra` protocols. The compiler refuses imports of concrete infra types.
- `App/AppDependencies.swift` is the **single** call site for `make...Live(...)` factories.

### 4.4 Logic Sandwich application

Every shell entry point follows: READ → CORE → WRITE.

Example (Save):

1. **READ** — `PanelViewModel` reads user click + active session id from local state, calls `APIClient.send(.save(instruction))`.
2. **READ** — backend response yields `{ vault_relative_path, markdown }`.
3. **READ** — `SecureBookmarkStore.resolve()` returns the live folder URL.
4. **READ** — `FileManager` enumerates existing filenames in the captures subfolder.
5. **CORE** — `resolveCollision(existing:, candidate:) -> String` (pure).
6. **WRITE** — `MarkdownFileWriter.write(folderURL:, relativePath:, markdown:)` performs atomic write.
7. **WRITE** — `APIClient.send(.saveResult(id, delivered: true, finalPath))` (best-effort).
8. **WRITE** — view model emits a toast event consumed by the panel.

## 5. Functional Core in Swift

The macOS app does not duplicate `packages/core` (TS) logic. It consumes backend responses.

The only Phase 1a Swift-side pure helper is `resolveCollision(existing: [String], candidate: String) -> String`. The backend cannot know the contents of the user's local vault folder, so collision resolution lives client-side.

Pure helpers live as `internal` free functions next to their consumers, in clearly-named files (`ResolveCollision.swift`, `Format*.swift`, `Reduce*.swift`), each with their own test file. They follow the same purity rules as `packages/core`:

- No I/O imports (`FileManager`, network, `Process`).
- No `Date()` reads (time passed in).
- No `UUID()` reads (id passed in).
- Real inputs, real outputs, no doubles in tests.

**Trigger to extract a `GotItCore` SPM package:** when ≥3 pure helpers exist and ≥2 packages depend on them. Phase 1a does not meet this threshold. YAGNI.

## 6. Configuration

`AppConfig` is a validated struct loaded at boot. **No hardcoded URLs, paths, or ports anywhere in source** (parallels backend `Config` rule from parent spec §13.2).

| Key                           | Source                                                  | Default                        | Notes                                                                                |
| ----------------------------- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `GotItBackendURL`             | `Info.plist` + `UserDefaults` override                  | `http://localhost:3000`        | Settings UI exposes the override.                                                    |
| `GotItVaultBookmark`          | `UserDefaults`                                          | unset                          | Set on first folder pick via `NSOpenPanel`. Stored as security-scoped bookmark data. |
| `GotItHotkeyOpenPanel`        | `UserDefaults` (managed by `KeyboardShortcuts` library) | `Cmd+Shift+Space`              | User-rebindable.                                                                     |
| `GotItInstallID`              | `UserDefaults`                                          | UUID generated on first launch | Not a credential. Identifies the device for `POST /device`.                          |
| `GotItDeviceToken`            | Keychain                                                | unset                          | Bearer token. Issued by backend on `POST /device`.                                   |
| `GotItAutoDetectScreenshots`  | `UserDefaults`                                          | `true`                         | Toggle for the `NSMetadataQuery` watcher.                                            |
| `GotItScreenshotGraceSeconds` | `UserDefaults`                                          | `3`                            | Cancel window before auto-send.                                                      |
| `GotItHealthProbeTimeoutMs`   | `Info.plist`                                            | `1500`                         | Used by `OfflineMonitor`.                                                            |

**Adding a new config key requires updating, in the same change:**

1. This table.
2. `AppConfig.swift` (validated parse + typed accessor).
3. The Settings UI if user-facing.

`AppConfig` exposes a typed object. View models, infra wrappers, and tests never read `UserDefaults` or `Bundle.main.infoDictionary` directly.

## 7. Permissions & First-Run Flow

Strategy: **hybrid JIT** (just-in-time per capability) plus a single one-step welcome screen.

### 7.1 Welcome screen (one step)

First launch shows a minimal screen embedded in the panel:

- Brief explanation of GotIt!.
- Backend URL field (defaulted from `Info.plist`).
- "Connect" button.
- "Try without backend" link (panel opens in offline mode; user can connect later via Settings).

On Connect: `POST /device { install_id }` → on success, store token, dismiss welcome screen, open empty panel. On failure: surface error, allow retry.

### 7.2 JIT permission prompts

| Capability                             | Triggered by                                   | UX                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen Recording (TCC)                 | First "Look again" click                       | Inline panel block: "Look again needs Screen Recording permission. [Open System Settings]". After return, app shows "Permission granted. [Relaunch GotIt]" (Screen Recording requires app relaunch on most macOS versions). |
| Vault folder                           | First Save click                               | Inline picker: "Choose your captures folder. [Choose…]" → `NSOpenPanel(canChooseDirectories: true, canCreateDirectories: true)`. Stores security-scoped bookmark.                                                           |
| Desktop / screenshot folder read (TCC) | First screenshot detected by `NSMetadataQuery` | macOS issues the prompt automatically when the file is read. Banner explains if denied.                                                                                                                                     |

### 7.3 Re-probe lifecycle

`DeviceCapabilities` re-probes on:

- App launch.
- `NSApplication.didBecomeActiveNotification` (covers user-grants-permission-then-returns).
- `NSApplication.didChangeScreenParametersNotification` (display add/remove).
- After any user action that requested a permission.

No background polling.

## 8. Hotkey, Screenshot, and Save Mechanisms

### 8.1 Hotkey

- Library: `KeyboardShortcuts` (sindresorhus, MIT, SPM dependency added to `GotItInfra`).
- Default binding: `Cmd+Shift+Space`. Confirmed unbound on default macOS.
- User rebind: SwiftUI recorder view in Settings.
- Conflict: registration result inspected; conflict opens Settings with recorder pre-focused and an alert: "Cmd+Shift+Space is taken by <app>. Choose a different shortcut."
- No tap-pattern hotkeys (e.g., double-tap modifier) in Phase 1a. Adds Accessibility permission requirement and custom `NSEvent` monitoring code without offsetting value.

### 8.2 Screenshot routing

- Primary: `NSMetadataQuery` with predicate `kMDItemIsScreenCapture = 1`, scope `NSMetadataQueryUserHomeScope`. Fires on `Cmd+Shift+3/4/5` saves regardless of save location.
- Fallbacks (always available, do not depend on the watcher):
  - Drag image onto panel.
  - ⌘V paste image bytes from clipboard.
  - 📎 paperclip button → `NSOpenPanel` filtered to `.png`, `.jpg`, `.jpeg`, `.heic`, `.gif`, `.webp`.
- Auto-send grace: detected screenshot triggers a toast "Screenshot captured — sending to GotIt!" with a 3s Cancel window before `/capture` is called.
- Clipboard-only screenshot variant (`Cmd+Shift+Ctrl+3/4`) is **not** auto-detected in Phase 1a. User can ⌘V-paste into the panel.

### 8.3 Save

- Backend `POST /save { instruction? }` returns `{ vault_relative_path, markdown, save_record_id }`. Backend never touches the filesystem.
- Client resolves `SecureBookmarkStore` to the user-picked vault root, joins `vault_relative_path`, runs `resolveCollision(existing:, candidate:)`, writes via `MarkdownFileWriter` (atomic write).
- Best-effort: `POST /save/:id/result { delivered: true, final_path }` to keep backend `save_record` accurate.
- UI confirmation toast: "Saved to GotIt!/2026-04-30-1542-stripe-docs.md" with click → `obsidian://open?path=...`. Fallback: Finder reveal (`NSWorkspace.activateFileViewerSelecting:`).
- The phrase "Obsidian Vault API" does **not** apply to Phase 1a. The client writes a plain Markdown file to a folder. Renaming in spec terminology and code: **`MarkdownFileWriter`**, not `VaultWriter`.

## 9. API & Auth

### 9.1 Endpoint enumeration

Typed router in `GotItInfra/API/Endpoints.swift`:

```swift
enum Endpoint<Response: Decodable> {
    case device(installID: String)                   // POST /device
    case health                                      // GET  /health
    case sessionsActive                              // GET  /sessions/active
    case sessionsCreate                              // POST /sessions
    case capture(image: Data, source: CaptureSource) // POST /capture (multipart)
    case chat(text: String, source: ChatSource)     // POST /chat
    case save(instruction: String?)                  // POST /save
    case saveResult(id: String, delivered: Bool, finalPath: String?) // POST /save/:id/result (best-effort)
}
```

`URLSessionAPIClient.send(_:)` is the single entry point. Token injection, retry, 401 handling, decoding, and offline gating all live there.

### 9.2 Token revalidation

- `Keychain.read("device_token")` is attached as `Authorization: Bearer <token>` on every request.
- On HTTP 401:
  1. Clear `device_token` from Keychain.
  2. `POST /device { install_id }` → if success, store new token and retry the original request once.
  3. If second attempt also returns 401 or `/device` fails → throw `APIError.unauthorized`.
- UI on `.unauthorized`: panel shows "Reconnect required." with Retry button. All write actions disabled.
- Backend contract (parent spec §11 update): `POST /device` is idempotent on `install_id`. Other endpoints return 401 on missing/unknown/revoked token.

### 9.3 Retry & offline

- `APIClient.send` does one auto-retry with exponential backoff (250ms, 500ms) on `URLError` transient codes and HTTP 5xx.
- `OfflineMonitor.recheck()` (cheap `GET /health`) runs before any write attempt; failure flips `isOnline = false` and surfaces `APIError.offline`. No background polling.
- Reconnect: next user action attempt that succeeds flips `isOnline = true` and clears the banner. No replay.

## 10. BOARD.md & Spec Impacts

### 10.1 New feature to add to `BOARD.md`

| ID                                | Feature                                                                                                                                                                                                             | Status  | Priority                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| **F013** Obsidian Plugin Delivery | Real Obsidian plugin (TypeScript, Obsidian plugin API) plus SSE delivery from the backend. Replaces direct file write. Enables cross-client reuse for the future Windows client (F007) and proper Vault API writes. | Planned | **Immediately after F001 MVP completes. Sits ahead of F002 in sequencing.** |

Rationale to record on the board: the Phase 1a file-write delivery is a deliberate stop-gap chosen for MVP scope discipline; the plugin path is the durable answer and unlocks cross-client reuse for F007.

Cross-references for F013 (immediately after F001 MVP completes; before F002): the F013 work introduces a new package `apps/obsidian-plugin/` (TypeScript), backend endpoints (`GET /saves/stream` SSE plus `POST /saves/:id/ack`), a `pending|delivered|failed` state machine on `save_record`, and a pairing flow (token-paste from macOS app). At F013 ship, the macOS `MarkdownFileWriter` switches from doing the write to forwarding the draft via the plugin path.

### 10.2 Parent spec amendments

The parent spec (`docs/specs/f001-screen-capture-mvp.md`) needs these small, in-place updates when this sub-spec is merged:

| Section               | Change                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5 Triggers           | Replace the "Global keybind capture" row with: native macOS screenshot routing via `NSMetadataQuery`. Replace "Direct invoke (Cmd+Opt+G)" hotkey with "Open panel hotkey (Cmd+Shift+Space, default; rebindable)". Drop `Cmd+Shift+G` capture hotkey.                                                                                                                                                                                |
| §6.2 Layout           | Phase 1a panel input row: `[text field] [📎 attach]  ·  [Look again] [Save] [Reset]`. Mic 🎤 and Listen 👂 buttons hidden until 1b/1c.                                                                                                                                                                                                                                                                                              |
| §9 Obsidian Save      | Rename to "Markdown Save". §9.4 Delivery contract: macOS client writes the Markdown directly to the configured vault folder via `FileManager` (Phase 1a). Plugin-based delivery is the next planned feature (see BOARD.md F0NEW). Drop "Vault API" / `Vault.process()` wording from Phase 1a description.                                                                                                                           |
| §11 API Contracts     | **Add new endpoint** `POST /save/:id/result { delivered, final_path }` (best-effort client → backend reporting; backend persists outcome on `save_record` for history accuracy). Note that `POST /device` is idempotent on `install_id` and that all other endpoints return 401 on missing/unknown/revoked token. These are backend amendments required by Phase 1a Plan B; the implementor must update `packages/api` accordingly. |
| §13.2 Configuration   | Note that `apps/macos` config lives in `AppConfig.swift` (this spec §6); same rule applies — no hardcoded URLs/paths in source.                                                                                                                                                                                                                                                                                                     |
| §16.1 Sprint contract | Add manual smoke checklist (this spec §11.5).                                                                                                                                                                                                                                                                                                                                                                                       |

These are mechanical edits performed during the spec write step; no design changes beyond what is captured here.

## 11. Testing Strategy

### 11.1 Tooling

- **Swift Testing** (`@Test` macros) for unit tests. Requires Xcode 16+ on the developer machine — listed as a sprint precondition in §12.
- **XCTest** for the `XCUITest` smoke target.
- No mocking framework. Plain Swift protocols + nullable factories.

### 11.2 Per-package coverage

**`GotItModels`** — round-trip Codable; schema-shape regression against `packages/shared` JSON fixtures.

**`GotItInfra`** — null-driven unit tests for every wrapper. Live wrappers smoke-tested against real macOS APIs where automation is reliable (Keychain, FileManager, SecureBookmark via tmp dir). Real ScreenCaptureKit, NSMetadataQuery, and global hotkey registration verified by manual smoke per parent spec §15.

**`GotItUI`** — view-model tests against null infra (state reducers, `render(APIError)`, offline state transitions, button enabled-state derivations). 5–8 snapshot or `ViewInspector` tests on `ChatView`, `OfflineBanner`, `FloatingPanel` content, `SettingsWindow`.

**Pure helpers** — direct input/output tests, no doubles.

### 11.3 Nullable factory pattern

```swift
public protocol APIClient {
    func send<R: Decodable>(_ endpoint: Endpoint<R>) async throws -> R
}

public enum APIClientFactory {
    public static func makeLive(baseURL: URL, keychain: KeychainStore, installID: String) -> APIClient { ... }
    public static func makeNull(responses: [Endpoint.ID: any Decodable] = [:],
                                 failures: [Endpoint.ID: APIError] = [:]) -> APIClient { ... }
}

internal final class URLSessionAPIClient: APIClient { /* real */ }
internal final class NullAPIClient: APIClient { /* test seam */ }
```

Null implementations have **no behavior beyond returning configured outputs**. They are not stub real implementations.

### 11.4 CI

- Phase 1a: local-only `xcodebuild test -scheme GotIt -destination "platform=macOS"` invoked from `pnpm test:macos`.
- Husky pre-push runs `pnpm test:macos` only when `apps/macos/` has changes since last commit.
- GitHub Actions for macOS deferred (paid runner cost; out of MVP scope).

### 11.5 Manual smoke checklist (Phase 1a sprint contract addendum)

1. Cmd+Shift+3 takes a screenshot → GotIt panel toasts → `Cancel` cancels; no cancel → image arrives in chat as a `screen_capture` message.
2. Cmd+Shift+Space → panel opens.
3. Drag image onto panel → same outcome as flow 1.
4. ⌘V into panel input with image on clipboard → same outcome.
5. 📎 attach button → file picker → image sent.
6. Type "hello" → press Enter → assistant reply renders.
7. Click "Look again" first time → permission prompt → grant → relaunch button → next click captures real screen, vision result appears.
8. Click Save → first time triggers folder picker → choose folder → Markdown file appears in chosen folder → click toast opens file in Obsidian (or Finder fallback).
9. Click Reset → empty session view, prior messages gone from panel; backend retains the old session.
10. Stop backend → next action → banner appears, write buttons disable. Restart backend → next action succeeds, banner clears.
11. (Developer-only check.) Manually delete the device row from backend DB → next action → silent re-pair via `POST /device`, action succeeds. Validator can rely on this being demonstrated in null-driven `APIClient` tests (see §12 sprint contract); the manual step is for the implementor's own verification.

The validator (clean session) reads this checklist and the implementor's evidence (screen recordings or commit-time notes) before scoring.

## 12. Sprint Contract

**Preconditions:**

- Xcode 16+ on the developer/CI machine (Swift Testing requirement).
- macOS 13 Ventura+ on the developer machine (parent spec §17 target).
- Free Apple ID set up in Xcode for Personal Team signing.

**Success criteria** (in addition to parent spec §16.1):

- [ ] All Phase 1a flows in §11.5 pass manually.
- [ ] All `GotItModels`, `GotItInfra`, `GotItUI` automated tests pass (Swift Testing).
- [ ] `pnpm test:macos` runs from repo root and passes.
- [ ] `swiftformat --lint apps/macos/` and `swiftlint apps/macos/` (if added) pass with zero errors.
- [ ] `xcodebuild build` for `GotIt` scheme produces a runnable bundle on macOS 13+.
- [ ] Free Apple ID + Personal Team signing is sufficient to build and run on the developer's Mac (no paid Apple Developer Program account required for Phase 1a).
- [ ] No hardcoded backend URL, file path, or token anywhere in source. `AppConfig` is the single boundary.
- [ ] Module boundary holds: `GotItUI` cannot import a concrete `URLSessionAPIClient` (verified by attempting it during code review).
- [ ] Token revalidation flow exercised by null-driven test: 401 → re-pair → retry succeeds; 401 → re-pair fails → `.unauthorized` surfaced.
- [ ] Husky pre-push gates pass: typecheck, lint, test, purity (TS side), Swift tests.

**Quality gate:** ≥7/10. Scoring per parent spec §16.1 (functionality 30, code quality 20, test coverage 20, spec conformance 20, lint+types 10).

## 13. Open Questions

None at spec time. Items that surfaced during brainstorming and were resolved:

- Project layout: SPM local packages (B). Resolved.
- Hotkey lib: `KeyboardShortcuts` + `Cmd+Shift+Space`. Resolved.
- Screenshot routing: `NSMetadataQuery` + drag/paste/attach. Resolved.
- Save delivery: `FileManager` direct write in 1a; plugin path in F0NEW after MVP. Resolved.
- HTTP client: `URLSession` + typed endpoint router (B). Resolved.
- App lifecycle: menu-bar-only (`LSUIElement = true`). Resolved.
- First-run: hybrid JIT with one-step welcome (C). Resolved.
- Mic/Listen buttons in 1a: hidden until 1b/1c (B). Resolved.

## 14. Terminology

To be added to parent spec §17 in the same change:

| Term                     | Definition                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarkdownFileWriter`     | Swift infra wrapper that performs the Phase 1a markdown save via `FileManager`. Replaces `VaultWriter` / `Obsidian Vault API` wording for 1a. |
| `ScreenshotWatcher`      | Swift infra wrapper around `NSMetadataQuery` with the screen-capture predicate.                                                               |
| `HotkeyRegistrar`        | Swift infra wrapper around `KeyboardShortcuts` library; manages registration and conflict reporting.                                          |
| `OfflineMonitor`         | Swift infra wrapper that exposes `isOnline` and the `recheck()` cheap `/health` probe.                                                        |
| `DeviceCapabilities`     | Observable value object in Swift exposing screen/mic/system-audio/display/vault-folder availability.                                          |
| `SecureBookmarkStore`    | Swift infra wrapper that persists and resolves security-scoped bookmarks for user-picked folders.                                             |
| `AppDependencies`        | DI root struct in the macOS app target. Single call site for `make...Live(...)` factories.                                                    |
| `AppConfig`              | Validated config struct on the macOS side; parallels the backend `Config` Zod schema rule.                                                    |
| `APIClient` / `Endpoint` | Swift typed endpoint router. `Endpoint<Response>` enum + `APIClient.send(_:)`.                                                                |

## 15. References

- Parent spec: `docs/specs/f001-screen-capture-mvp.md`
- Backend plan (completed): `docs/plans/f001-phase-1a-backend.md`
- `KeyboardShortcuts` library: <https://github.com/sindresorhus/KeyboardShortcuts>
- `NSMetadataQuery` screen-capture predicate: Apple File Metadata Query Programming Guide
- `NSPanel` style flags: AppKit `NSPanel.StyleMask`
- `ScreenCaptureKit`: Apple framework reference
- TCC permission model: Apple Privacy Preferences Policy Control documentation
- Obsidian URL scheme `obsidian://open`: Obsidian help docs
