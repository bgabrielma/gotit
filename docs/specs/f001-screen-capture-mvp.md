# F001 — Screen Capture + Chat MVP

> Status: Draft (pending user review)
> Owner: Brainstorming session 2026-04-28
> Depends on: none — foundational feature
> Blocks: F002, F003, F004, F005, F006, F007, F009, F011

## 1. Goal

Deliver the first end-to-end GotIt! workflow on macOS: trigger → screen-aware AI → floating chat → save to Obsidian. Prove the second-brain capture thesis with a single coherent slice that exercises every architectural seam (Swift client, Express backend, functional core, Obsidian Vault API handoff) so subsequent features can extend rather than re-architect.

## 2. Scope

### 2.1 In scope

| Capability                    | Notes                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot trigger            | User-supplied image opens chat with that image as context.                                                                            |
| Global keybind trigger        | Configurable shortcut captures full active display, runs vision once, opens panel with result.                                        |
| Direct invoke trigger         | Menu bar item or keybind opens panel with no capture; chat is immediately usable.                                                     |
| Chat-driven screen refresh    | While the panel is open, user can request a fresh one-shot vision pass.                                                               |
| Floating chat panel           | Native `NSPanel`, Raycast-style, follows active screen, dismissible.                                                                  |
| Active session append         | New screenshots, audio inputs, save actions append to current session.                                                                |
| Reset context                 | Explicit user action ends the active session and starts a fresh one.                                                                  |
| History tab                   | List prior persisted sessions; reopen one to make it active again (read-only continuation).                                           |
| Backend AI screen analysis    | Vision pass extracts URLs first, then OCR text, then context summary, guided by the default system prompt.                            |
| Text chat                     | Send messages to the active session; backend continues the conversation with full history + last vision result.                       |
| Push-to-talk microphone input | Hold-to-record (or toggle), VAD-based silence cutoff, transcript appended as user message.                                            |
| "Listen to this" mode         | System audio capture runs until user pauses/stops; transcript streamed in as one or more user messages.                               |
| Basic Obsidian save           | System-prompt-driven minimal entry (frontmatter + body) returned as a save draft; the client/plugin writes it via Obsidian Vault API. |
| Save-format override          | User instruction in chat (e.g., "save as a code snippet") shapes that one save's format.                                              |
| Persistence                   | Backend stores sessions, messages, and saves. Authoritative source of truth (per design choice A).                                    |

### 2.2 Explicitly out of scope (deferred)

| Item                                                           | Lives in                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Stealth rendering (`NSWindow.sharingType = .none`)             | F005 (architecturally planned; toggle wiring stays in F001 as a no-op preference) |
| Custom system prompt UI                                        | F004 (default prompt ships hard-coded, swappable by env config)                   |
| Save templates, routing rules, multi-vault                     | F002, F006                                                                        |
| Audio device selection, transcript editor, long-form recording | F003                                                                              |
| Search/filter/pin/export of history                            | F011                                                                              |
| Windows client                                                 | F007                                                                              |
| Cross-device sync, client-side cache for offline               | F011 / future                                                                     |
| Local model support                                            | F009                                                                              |

### 2.3 Non-goals

- Continuous/background screen watching. Vision is event-driven only.
- Multi-user / multi-account support. Single local user.
- Real-time collaboration on a session.

## 3. Sprint Phases

F001 is one feature but ships in four sequenced phases. Each phase ends with validator pass and STATUS.md update. Later phases assume earlier phases are validated.

| Phase                          | Slice                                                                                                            | Rationale                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1a — Capture + Chat + Save** | Screenshot/keybind/invoke triggers, panel UI, text chat, vision pass, basic Obsidian save, session append, reset | Smallest end-to-end vertical that proves the architecture. Cuts audio scope, which is the heaviest native lift. |
| **1b — Push-to-talk mic**      | AVAudioEngine capture, VAD cutoff, transcription, transcript-as-message                                          | Adds the lighter audio path first.                                                                              |
| **1c — Listen mode**           | ScreenCaptureKit system audio, streamed transcription, pause/stop control                                        | Second audio path, builds on 1b transcription pipeline.                                                         |
| **1d — History tab**           | Sessions list UI, reopen-as-active, persisted summaries                                                          | Last because it depends on having sessions worth listing.                                                       |

Phase order is sequential. Phase boundaries are real validation gates, not internal milestones.

## 4. Architecture

### 4.1 Layering

```
apps/macos (Swift/SwiftUI)        packages/api (Express/TS)
─ NSPanel UI                      ─ HTTP routes
─ ScreenCaptureKit                ─ Vision provider wrapper
─ AVAudioEngine (mic)             ─ Transcription provider wrapper
─ ScreenCaptureKit audio          ─ Save draft route (`POST /save`)
─ Global hotkey                   ─ SQLite store wrapper
─ HTTP client                     ─ System-prompt registry (env-configured)
        │                                  │
        └────── HTTPS / JSON ──────────────┘
                         │
              packages/core (pure TS)
              ─ extractUrls
              ─ formatObsidianEntry
              ─ buildSystemPrompt
              ─ scoreCaptureContext
              ─ resolveSaveFormat (default vs override)
              ─ sessionReducer (append message, reset, etc.)

              packages/shared (TS types + Zod)
              ─ API request/response schemas
              ─ Domain types: CapturedContent, ChatMessage, Session, SaveRequest, etc.
```

Client never calls AI providers directly. Client/plugin writes to Obsidian via Vault API. Client never persists session state. All of that flows through `packages/api`, which delegates pure logic to `packages/core`.

### 4.2 Functional core boundaries

`packages/core` is pure. Functions take inputs (including `now: Date` when needed) and return outputs. No I/O. Tests use real inputs, no doubles.

`packages/api` is the imperative shell. Each external dependency (vision, transcription, SQLite) is wrapped in an infrastructure class with `create()` and `createNull()` per the Nullable pattern.

`apps/macos` follows the same pattern in Swift. ScreenCaptureKit, AVAudioEngine, file system, and HTTP get infrastructure wrappers with Nullable factories for unit/UI tests.

### 4.3 Logic sandwich example

```
POST /capture
  1. READ:  parse multipart image, fetch active session from store
  2. READ:  call VisionAI.analyze(image)               (Nullable in tests)
  3. CORE:  extractUrls(text)                          (pure)
  4. CORE:  buildAssistantMessage(analysis, urls, session) (pure)
  5. WRITE: append message to session (Store.appendMessage)
  6. WRITE: respond with updated session tail
```

## 5. Triggers

| Trigger        | Source                                                                                                                               | Behavior                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Screenshot     | User drags an image into the panel, uses macOS screenshot shortcut routed to GotIt!, or selects "Capture region" in the menu         | Image becomes the new context for the active session. Vision runs.                           |
| Global keybind | Configurable hotkey (default: `Cmd+Shift+G`)                                                                                         | App captures the active display (`SCStream` one-shot), runs vision, opens panel with result. |
| Direct invoke  | Menu bar click, dock icon, or "Open chat" hotkey (default: `Cmd+Opt+G`)                                                              | Panel opens. No capture. Active session shown.                                               |
| Chat refresh   | "Look again" button in panel, or chat instruction matching a small intent classifier ("look at the screen now", "what's on screen?") | New one-shot capture + vision pass, appended to active session as a new context block.       |

Intent classifier for refresh requests lives in `packages/core` as `detectRefreshIntent(message: string): boolean`. Pure heuristic (regex/keyword), upgradable later.

## 6. Floating Chat Panel

### 6.1 Window behavior

- `NSPanel` with `.nonactivatingPanel`, `.hudWindow`, and `.utilityWindow` style flags.
- Floats above ordinary windows. Does not steal focus from the underlying app while the user reads it.
- Positioned on the screen containing the active capture.
- Dismiss: `Esc` key, click outside (configurable), or explicit close.
- Stealth toggle preference exists in settings, defaults to off, wires `NSWindow.sharingType` accordingly. Real stealth UX work lives in F005.

### 6.2 Layout

```
┌─────────────────────────────────────────┐
│  GotIt!  [active session badge]   [⚙]   │
├─────────────────────────────────────────┤
│  Context preview (latest capture)        │
│  ─ thumbnail + URL chips + summary      │
├─────────────────────────────────────────┤
│  Conversation                            │
│  ─ assistant: "..."                     │
│  ─ user: "..."                          │
│  ─ system: "(captured screen)"          │
├─────────────────────────────────────────┤
│  Input row                               │
│  [text field]   [🎤 mic]  [👂 listen]    │
│  [Look again] [Save] [Reset]             │
└─────────────────────────────────────────┘
```

### 6.3 Modes

| Mode               | UI signal                  | Behavior                                                                                                                                                                                                                      |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text               | Default                    | User types; submit sends a `POST /chat` against active session.                                                                                                                                                               |
| Mic (push-to-talk) | Mic button held or toggled | Recording indicator visible. Release/toggle-off ends segment. VAD silence > 1.5s also ends segment. Transcript appended as user message via `POST /chat` with `source: "mic"`.                                                |
| Listen             | Listen button toggled on   | Pulsing indicator. ScreenCaptureKit audio capture runs. Transcription streams to backend in chunks via `POST /chat/audio-stream`. Each finalized chunk appended as user message with `source: "listen"`. Stops on toggle-off. |

Only one audio mode is active at a time. Activating mic stops Listen; activating Listen stops mic.

### 6.4 History tab (Phase 1d)

- Tab switch in panel header: "Chat" | "History".
- History view: reverse-chronological list of sessions with title, started-at, message count.
- Click a session → it becomes active (replaces current active session). Subsequent inputs append to it.
- "New session" button: explicit reset, mirrors the Reset button.

## 7. Session Model

### 7.1 Concepts

- **Session:** ordered list of messages + metadata. Has a server-generated id.
- **Active session:** the session currently bound to the panel. Backend tracks `active_session_id` per client install.
- **Message:** one of `{user_text, user_voice, user_listen_chunk, screen_capture, assistant, save_record, system}`. Each carries a timestamp.
- **Reset:** server creates a new session, sets it as active. Old session is preserved in history.

### 7.2 Append rules

| Action                       | Resulting message(s)                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| User types text              | `user_text`                                                                |
| User submits via mic         | `user_voice` (with transcript)                                             |
| Listen finalizes a chunk     | `user_listen_chunk`                                                        |
| Capture/keybind/refresh runs | `screen_capture` (with image ref + analysis) followed by `assistant` reply |
| Save action completes        | `save_record` (with vault path + summary)                                  |

Pure reducer in core: `appendMessage(session, message): Session`. Tests assert state transitions on real data.

### 7.3 Reset

Reset is a deliberate action. There is no auto-reset based on idle, time, or app lifecycle. The active session persists across panel dismiss/reopen and across app restart.

## 8. Backend AI Analysis

### 8.1 Default system prompt

Hard-coded in `packages/api/src/prompts/default-system.ts`, exported by env override in F004. The default prompt instructs the model to:

1. Extract every URL/link/reference visible on screen, with anchor text and surrounding context.
2. Return OCR text grouped by visual region.
3. Identify the active context (browser page, code editor, chat app, video, document).
4. Produce a concise summary the user can question or save.

### 8.2 Vision pipeline

```
image bytes
  → VisionAI.analyze(image, prompt)        (shell, Nullable)
  → AnalysisResult {raw_text, urls[], regions[], context_kind, summary}
  → extractUrls(raw_text)                   (core, pure — refines/de-dupes)
  → buildAssistantMessage(...)              (core, pure)
  → persist + return
```

`extractUrls` exists even though the model returns URLs because the model is non-deterministic; the pure pass enforces the contract.

### 8.3 Provider selection

Single provider in MVP (Anthropic Claude). Two wrappers:

- `VisionAI` — handles the screen-analysis call. Model id from env `GOTIT_VISION_MODEL` (default: a Claude vision-capable model).
- `ChatAI` — handles the chat-completion call. Model id from env `GOTIT_CHAT_MODEL` (default: same Claude family). Same Nullable pattern as `VisionAI`.

Two wrappers (not one) because the two paths have different system prompts, different request shapes, and may diverge on model choice (e.g., a cheaper text-only model for chat). Routes never call the SDK directly.

### 8.4 Chat pipeline

`POST /chat` sends the active session's `messages_tail` window plus the latest screen-capture context. Backend builds the request via pure `buildChatRequest(session, userMessage, latestCapture): ChatRequest` in core.

**Chat persona prompt** is hard-coded at `packages/api/src/prompts/default-chat.ts`. It instructs the assistant to be concise, screen-aware, knowledge-capture-oriented, and to defer formatting decisions to the save layer. F004 makes it user-editable; in F001 it is fixed.

**Multi-modal turn shape:** chat does **not** re-send raw image bytes. It threads the most recent `screen_capture` message's `AnalysisResult` (summary + urls + raw_text) into the chat turn as text context. Image bytes are sent only on the original `/capture` call. This keeps chat cheap and stateless from the model's perspective — vision happens once per capture, chat reasons over the structured analysis.

**No model tools in MVP.** Save, refresh, and reset are user-button-driven (`POST /save`, `POST /capture`, `POST /sessions`). The model does not call functions. Tool use is deferred (likely lands alongside F004 or later).

**Streaming:** `POST /chat` returns the final `assistant_message` in one response body. Token streaming (SSE) is a future iteration; not in F001.

## 9. Obsidian Save

### 9.1 Configuration

- One "captures" folder inside the vault (default: `GotIt!/`), configurable.
- One filename strategy: `YYYY-MM-DD-HHmm-<slug>.md` where slug derives from the AI summary (pure function `slugifySummary`).

### 9.2 Default format (no override)

```markdown
---
source: gotit
captured_at: 2026-04-28T15:42:00Z
session_id: sess_abc123
urls:
  - https://example.com/foo
  - https://example.com/bar
context_kind: browser_article
---

# <AI-derived title>

<AI-derived summary>

## Links

- [Foo](https://example.com/foo)
- [Bar](https://example.com/bar)

## Notes

<assistant message body or save instruction body>
```

Rendered by pure `formatObsidianEntry(content, template, savedAt)` in core.

### 9.3 Override

Save instruction in chat (e.g., "save this as a code snippet with the URL at the top") triggers a single-shot AI render that replaces the body section. Frontmatter stays consistent. Pure `resolveSaveFormat(defaultTemplate, userInstruction): RenderPlan` decides what to override.

### 9.4 Delivery contract

- `POST /save` returns `{ vault_relative_path, markdown, save_record_id }`.
- Backend never writes vault files directly.
- Obsidian plugin/client writes using Vault API (prefer `Vault.process()` for edits, `Vault.create()` for new files).
- Filename collisions are resolved by the plugin/client during Vault write.

## 10. Audio Inputs

### 10.1 Push-to-talk mic (Phase 1b)

- `AVAudioEngine` records to in-memory buffer.
- VAD: threshold-based silence detection (energy under threshold for ≥1.5s ends segment). Pure `detectSilence(samples, threshold, duration)` in core; engine is shell.
- On segment end, audio uploaded to `POST /transcribe` (returns text), then `POST /chat` with `source: "mic"`.
- Cancel: user presses Esc or releases before VAD; recording dropped.

### 10.2 Listen mode (Phase 1c)

- `SCStream` configured for system audio only (no display).
- Audio chunked into ~10s windows. Each window uploaded to `POST /chat/audio-stream` which transcribes and appends as `user_listen_chunk`.
- UI shows running transcript preview.
- Stop: user toggles off. In-flight chunk finalizes.
- Pause: user toggles pause. Capture stops; resume continues a new stream of chunks (no merging).

### 10.3 Permissions

- Microphone permission and screen recording permission requested on first use.
- Denial path: panel shows clear remediation (system settings deep link).

## 11. API Contracts

All requests/responses defined as Zod schemas in `packages/shared`. Listed here in compact form; full schemas live in code.

All requests carry a `device_id` bearer token (issued on first run, see §13). The token resolves to the current active session server-side; explicit `session_id` is required only when acting on a non-active session.

`messages_tail` = last N messages of a session, default N=50, where N is a backend constant (not yet user-configurable).

| Method + Path                 | Purpose                                                                                                                                                                                              | Request body                     | Response                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `POST /sessions`              | Start new session (reset). Sets it as active.                                                                                                                                                        | `{}`                             | `{ session_id, started_at }`                        |
| `GET /sessions/active`        | Fetch current active session for the calling device                                                                                                                                                  | —                                | `{ session, messages_tail }`                        |
| `POST /sessions/:id/activate` | Reopen a history session as the active one                                                                                                                                                           | —                                | `{ session, messages_tail }`                        |
| `GET /sessions`               | List sessions for history tab                                                                                                                                                                        | `?cursor=&limit=` (query)        | `{ sessions[], next_cursor? }`                      |
| `POST /capture`               | Submit image, run vision, append to active session                                                                                                                                                   | multipart `{ image, source }`    | `{ message_id, analysis, assistant_message }`       |
| `POST /chat`                  | Send text or finalized voice transcript to active session                                                                                                                                            | `{ text, source }`               | `{ message_id, assistant_message }`                 |
| `POST /chat/audio-stream`     | Submit a Listen chunk against active session                                                                                                                                                         | multipart `{ audio, chunk_seq }` | `{ message_id, transcript, assistant_message? }`    |
| `POST /transcribe`            | One-shot transcription for mic (no session side-effects)                                                                                                                                             | multipart `{ audio }`            | `{ text }`                                          |
| `POST /save`                  | Build Obsidian save draft for client-side Vault API write. Works for chat-only sessions (no screenshot required): title derived from last user text, body from last assistant reply, empty analysis. | `{ instruction? }`               | `{ vault_relative_path, markdown, save_record_id }` |
| `POST /device`                | Issue device token on first run                                                                                                                                                                      | `{ install_id }`                 | `{ device_id, token }`                              |
| `GET /health`                 | Backend reachability probe (no auth, cheap)                                                                                                                                                          | —                                | `{ ok: true, version }`                             |

`source` enum: `screenshot | keybind | refresh | invoke | mic | listen | text`.

`assistant_message` on `/chat/audio-stream` is present only when the backend decides a chunk warrants an immediate assistant reply (e.g., user explicitly addressed GotIt!). Default behavior in MVP: no auto-reply on Listen chunks; assistant replies only on explicit `/chat` or `/capture`.

## 12. Data Models

Defined in `packages/shared` as Zod schemas. Shape sketch:

```ts
type Session = {
  id: string
  device_id: string
  started_at: ISODate
  ended_at: ISODate | null
  title: string | null // AI-derived after first capture
}

type Message =
  | { id; session_id; kind: 'user_text'; text; source; created_at }
  | { id; session_id; kind: 'user_voice'; text; audio_ref; source: 'mic'; created_at }
  | { id; session_id; kind: 'user_listen_chunk'; text; audio_ref; chunk_seq; created_at }
  | {
      id
      session_id
      kind: 'screen_capture'
      image_ref
      analysis: AnalysisResult
      source
      created_at
    }
  | { id; session_id; kind: 'assistant'; text; created_at }
  | { id; session_id; kind: 'save_record'; vault_path; instruction?; created_at }
  | { id; session_id; kind: 'system'; text; created_at }

type AnalysisResult = {
  raw_text: string
  urls: { href: string; anchor?: string; near_text?: string }[]
  regions: { kind: 'header' | 'paragraph' | 'code' | 'ui' | 'media'; text: string; bbox?: BBox }[]
  context_kind: 'browser_article' | 'code' | 'chat' | 'video' | 'doc' | 'unknown'
  summary: string
}
```

## 13. Storage & Configuration

### 13.1 Storage

- Backend uses **SQLite** via a `Store` infrastructure wrapper (Nullable in tests).
- Tables: `sessions`, `messages`, `analyses`, `save_records`, `images` (path + metadata; bytes on disk under `${GOTIT_DATA_DIR}/images/`), `audio` (same pattern).
- Single-user MVP: no auth on the API beyond a long-lived `device_id` token issued on first run.
- Migrations: hand-written SQL files in `packages/api/migrations/`, run on startup.

Choice rationale: SQLite is sufficient for one device, zero-config, easy to back up. Postgres swap is a wrapper change later.

### 13.2 Configuration & Tooling

**No hardcoded secrets, model ids, paths, or ports anywhere in source.** All runtime configuration flows through environment variables, loaded by `packages/api` at startup via `dotenv`. The client (`apps/macos`) does not read `.env`; client settings (capture folder, vault choice, hotkeys) live in `UserDefaults`.

**Files at repo root:**

| File            | Tracked in git      | Purpose                                                                                                                                          |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.nvmrc`        | yes                 | Pins Node version for the whole monorepo. Currently `22.16.0`. `nvm use` reads it.                                                               |
| `.env.template` | yes                 | Documented template of every env var the backend reads. Source of truth — adding a var without updating this file is a spec-conformance failure. |
| `.env`          | **no** (gitignored) | Real values. Each developer copies from `.env.template` and fills in.                                                                            |
| `.env.local`    | no (gitignored)     | Local overrides, optional.                                                                                                                       |

**Env vars (canonical list — must match `.env.template`):**

| Var                  | Required | Default                        | Notes                                                                                |
| -------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------ | ---- | ---- | ------- |
| `ANTHROPIC_API_KEY`  | yes      | —                              | Provider key for `VisionAI` and `ChatAI`. No default; backend fails fast if missing. |
| `GOTIT_VISION_MODEL` | no       | Claude vision-capable model id | Used by `VisionAI`.                                                                  |
| `GOTIT_CHAT_MODEL`   | no       | Claude chat-capable model id   | Used by `ChatAI`. May differ from vision.                                            |
| `GOTIT_DB_PATH`      | no       | `./data/gotit.db`              | SQLite database file.                                                                |
| `GOTIT_DATA_DIR`     | no       | `./data`                       | Root for binary blobs. Subfolders `images/` and `audio/` created on demand.          |
| `PORT`               | no       | `3000`                         | Express bind port.                                                                   |
| `LOG_LEVEL`          | no       | `info`                         | `error                                                                               | warn | info | debug`. |

**Adding a new env var requires updating, in the same change:**

1. `.env.template` (with comment + safe default if any)
2. This table (§13.2)
3. The `Config` Zod schema in `packages/api/src/config.ts` (validates env at boot, fails fast on missing required keys)

The `Config` module exposes a typed object; routes never read `process.env` directly. This keeps env access at one boundary and gives the validator a single grep target for purity-style checks on configuration leakage.

## 14. Error Handling & Degraded Modes

### 14.1 Per-failure responses

| Failure                          | Behavior                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Vision API error                 | Backend returns structured error; client shows "Couldn't read screen" with retry. Session unchanged.     |
| Transcription error              | Mic: drop segment, surface message. Listen: drop chunk, continue stream.                                 |
| Obsidian plugin write error      | Plugin/client surfaces the Vault API error and keeps the save draft available for retry.                 |
| Permission denied (screen / mic) | Panel shows deep link to System Settings + explanation.                                                  |
| Hotkey conflict at register time | App shows alert with chosen + conflicting binding.                                                       |
| Backend 5xx                      | Client treats as transient: one auto-retry with backoff, then surface error. Session UI state preserved. |

### 14.2 Offline mode (no internet or backend unreachable)

Backend is authoritative (§13), so offline = degraded mode. The app does not silently store actions and replay them later in MVP — that introduces consistency questions (which session was active? merge order? user-reset in between?) better solved by F011's hybrid cache.

**Client behavior when offline:**

- Panel opens. Menu bar item is functional.
- Persistent **offline banner** at top of panel: "GotIt! is offline — reconnect to capture, chat, or save."
- Last-loaded active session view stays visible (read-only) for the lifetime of the running app process. Not persisted across restart.
- All write actions are **blocked at the UI layer** (buttons disabled with tooltip): Send, Look again, Save, Reset, Capture (keybind), mic, Listen.
- Keybind that triggers capture: when pressed offline, panel opens, banner shows, capture is **not** taken (no silent screenshot of user's screen with nowhere to send). This is also a privacy property.
- Backend reachability checked via cheap `GET /health` on app launch and on every action attempt. No background polling.
- On reconnect: banner clears, write actions re-enable. No automatic replay — user explicitly retries.

**No queueing in MVP.** Out of scope: capture-and-replay, draft-message storage, offline-save buffer. All deferred to F011 (hybrid cache).

**State after restart while offline:** App launches, hits `/health`, fails, shows offline banner with **no active session view** (only an "offline" empty state). On reconnect, app fetches active session normally.

### 14.3 Device unavailability

| Missing                              | Detection                                                                                      | Behavior                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| No microphone available              | `AVAudioEngine` enumeration returns no input device                                            | Mic button rendered disabled with tooltip "No microphone detected."                           |
| Microphone permission denied         | `AVCaptureDevice.authorizationStatus(for: .audio)`                                             | Mic button shows lock icon + tap opens System Settings deep link.                             |
| No system audio capturable           | `SCShareableContent` returns no audio sources, or system has no playing audio source available | Listen button disabled with tooltip "System audio unavailable." (User must play audio first.) |
| Screen recording permission denied   | `CGPreflightScreenCaptureAccess()`                                                             | Capture / keybind / Look again disabled; banner with deep link to System Settings.            |
| No active display                    | `SCShareableContent.displays` empty (e.g., closed lid, no external display)                    | Capture path disabled with tooltip "No display detected."                                     |
| Vault write failure in plugin/client | Vault API call throws                                                                          | Panel shows actionable remediation and allows retry with the same draft payload.              |

Device probes run at launch and re-run on relevant lifecycle events (audio device hotplug notification, display config change, permission revocation). Probe results live in a single `DeviceCapabilities` value object the panel observes.

**No silent failures.** Every disabled control has a tooltip explaining why. Every action that could fail at execution checks the relevant capability first, so the user never clicks an "available" button that fails.

## 15. Testing Strategy

Per CLAUDE.md quality pipeline.

| Layer             | Approach                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`   | Pure input/output tests. No doubles. Real inputs, real expected outputs. Includes property tests where natural (e.g., URL extractor against curated samples).                                          |
| `packages/shared` | Schema validation tests. Type-only tests where useful.                                                                                                                                                 |
| `packages/api`    | Sociable tests with Nullables. Each route tested against `createApp({ visionAI: VisionAI.createNull(...), transcription: ..., obsidian: ..., store: ... })`. No `jest.mock`.                           |
| `apps/macos`      | Swift unit tests on infrastructure wrappers (Nullable). UI tests on panel behavior. Manual smoke tests for ScreenCaptureKit / AVAudioEngine flows because real capture cannot be mocked at that layer. |

Validator runs the full pipeline (`pnpm validate`) plus purity check on `packages/core` and terminology lint against this spec.

## 16. Sprint Contracts

### 16.1 Phase 1a — Capture + Chat + Save

**Success criteria**

- [ ] Keybind triggers a screen capture; panel opens with vision result in <3s on a clean run.
- [ ] Screenshot drag-in updates the active session.
- [ ] Direct invoke opens panel without capturing.
- [ ] Text chat round-trips through backend; assistant response appears in panel.
- [ ] "Look again" button captures fresh screen and appends to active session.
- [ ] Reset starts a new session; old session persists in store.
- [ ] Save returns a Markdown draft payload that the client/plugin writes to vault via Obsidian Vault API.
- [ ] Save instruction in chat overrides the body format.
- [ ] **Offline mode:** with backend unreachable, panel opens, banner shows, all write actions disabled with tooltips, keybind does not silently capture, last-loaded session view stays read-only; on reconnect, banner clears and actions re-enable. (§14.2)
- [ ] **Device fallback:** with screen recording permission denied, capture/keybind/Look again all disabled with deep-link tooltip; with no displays attached, capture disabled with tooltip; plugin vault write failures surface actionable remediation. (§14.3)
- [ ] All `packages/core` tests pass with zero doubles.
- [ ] `packages/api` tests pass with `createNull()` infra; no `jest.mock`.
- [ ] Backend reachability + device capability paths covered by Nullable-driven tests.
- [ ] Husky pre-push gates pass: typecheck, lint, test, purity.
- [ ] **Configuration:** `.nvmrc`, `.env.template`, and `packages/api/src/config.ts` exist; backend boots from a `.env` populated from the template; `process.env` is read only inside `config.ts`; backend fails fast with a clear error if `ANTHROPIC_API_KEY` is missing. (§13.2)

**Quality gate:** ≥7/10. Scoring: functionality 30, code quality 20, test coverage 20, spec conformance 20, lint+types 10.

### 16.2 Phase 1b — Push-to-talk mic

**Success criteria**

- [ ] Hold/toggle records mic; release/VAD silence ends segment.
- [ ] Transcript appended to active session as `user_voice`.
- [ ] Esc cancels recording without sending.
- [ ] Mic permission denial shows actionable message.
- [ ] **Device fallback:** no input device → mic button disabled with tooltip; permission denied → lock icon + System Settings deep link; offline → mic button disabled (cannot send transcript). (§14.2, §14.3)
- [ ] `packages/api` transcription tested via `Transcription.createNull()`; no `jest.mock`.
- [ ] Husky pre-push gates pass.

**Quality gate:** ≥7/10. Same scoring rubric as 1a.

### 16.3 Phase 1c — Listen mode

**Success criteria**

- [ ] Toggle on starts system-audio capture; chunks stream to backend.
- [ ] Each finalized chunk appended as `user_listen_chunk`.
- [ ] Toggle off finalizes in-flight chunk and stops capture.
- [ ] Switching from mic to Listen (or back) stops the previous mode cleanly.
- [ ] **Device fallback:** no system audio source available → Listen button disabled with tooltip; screen recording permission denied → disabled with deep link; offline mid-session → in-flight chunk dropped, Listen toggles off, banner shows. (§14.2, §14.3)
- [ ] Husky pre-push gates pass.

**Quality gate:** ≥7/10. Same scoring rubric as 1a.

### 16.4 Phase 1d — History tab

**Success criteria**

- [ ] History tab lists prior sessions reverse-chronologically with title + started-at + count.
- [ ] Selecting a session activates it; subsequent inputs append to it.
- [ ] "New session" button resets to a fresh active session.
- [ ] **Offline:** History tab shows "offline — reconnect to view history" empty state; no stale list rendered. (§14.2)
- [ ] Husky pre-push gates pass.

**Quality gate:** ≥7/10. Same scoring rubric as 1a.

## 17. Terminology

These are the canonical names. Code, file names, and tests must match. Validator greps for drift.

| Term                                                             | Meaning                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Session`                                                        | Persisted ordered list of messages with metadata.                                                                                                    |
| `ActiveSession`                                                  | The session bound to the panel right now.                                                                                                            |
| `Message`                                                        | One entry in a session. Kinds enumerated in §12.                                                                                                     |
| `CapturedContent`                                                | Image + AnalysisResult bound to a `screen_capture` message.                                                                                          |
| `AnalysisResult`                                                 | Structured vision output (urls, regions, context kind, summary).                                                                                     |
| `extractUrls`                                                    | Pure function, refines URLs from raw text.                                                                                                           |
| `formatObsidianEntry`                                            | Pure renderer for the Markdown save body.                                                                                                            |
| `resolveSaveFormat`                                              | Pure function that picks default vs override render plan.                                                                                            |
| `appendMessage` / `sessionReducer`                               | Pure session state transitions.                                                                                                                      |
| `VisionAI`, `ChatAI`, `Transcription`, `ObsidianWriter`, `Store` | Backend infrastructure wrappers (Nullable-capable).                                                                                                  |
| `screen-analysis prompt`                                         | System prompt steering the vision pass. (§8.1)                                                                                                       |
| `chat persona prompt`                                            | System prompt steering chat completions. Distinct from screen-analysis prompt. (§8.4)                                                                |
| `buildChatRequest`                                               | Pure builder in core that assembles the chat-model request from session + user message + latest capture analysis. (§8.4)                             |
| `floating panel`                                                 | The macOS NSPanel UI surface. (Not "popup", "overlay", "widget".)                                                                                    |
| `Listen mode`                                                    | System audio capture mode. (Not "ambient", "always-on".)                                                                                             |
| `push-to-talk`                                                   | Mic mode. (Not "voice input" alone.)                                                                                                                 |
| `Reset`                                                          | Explicit user action that ends active session and starts a new one.                                                                                  |
| `offline mode`                                                   | App runs with backend unreachable; writes blocked, banner shown, no silent capture. (§14.2)                                                          |
| `DeviceCapabilities`                                             | Single value object held by the panel describing current input/output device + permission state, refreshed on hotplug and permission events. (§14.3) |
| `BackendReachability`                                            | `GET /health`-driven boolean signal that gates write actions. (§14.2)                                                                                |
| `Config`                                                         | Typed config object built from validated env vars at boot; the only place `process.env` is read in the backend. (§13.2)                              |

## 18. Open Questions

None blocking implementation. Items that may emerge during build:

1. Exact vision model + cost per call — provider config, not architecture.
2. Audio chunk size for Listen — start at 10s, tune empirically.
3. Whether refresh intent needs an LLM classifier or stays heuristic — start heuristic, revisit if false positives bite.

## 19. References

- `README.md` — product behavior and capability table
- `BOARD.md` — feature dependencies and sprint sequence
- `AGENTS.md` (a.k.a. `CLAUDE.md`) — architecture rules, quality pipeline, testing strategy
- `docs/research/macos-apis.md` — ScreenCaptureKit, AVAudioEngine, NSPanel notes
- James Shore — "Testing Without Mocks" (Nullable pattern)
