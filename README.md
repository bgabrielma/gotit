# GotIt! Overview

> Product-level source of truth for user-facing behavior, session semantics, and capability definitions.

GotIt! is an AI-powered second-brain app for capturing what the user is seeing or hearing, reasoning about it in a floating chat panel, and saving the useful parts into a knowledge system such as Obsidian.

At a product level, GotIt! sits between AI screen understanding, lightweight chat, and personal knowledge capture. The intended feel is a native menu bar companion that stays out of the way until invoked, then helps the user understand, summarize, question, and store what is currently on screen.

The product starts macOS-first as a menu bar app with a native Swift/SwiftUI client and an Express/TypeScript backend. The long-term direction is a cross-platform system with a Windows client consuming the same backend contracts.

## What GotIt! Does

GotIt! is designed to reduce friction between "I found something useful" and "this is now stored in my second brain."

Instead of manually copying links, notes, and context out of a browser tab, Slack thread, video, document, or app window, the user can trigger GotIt!, let the AI inspect the current screen, ask follow-up questions, and save the result in a structured way.

The core value is second-brain capture while the user is already learning, reading, watching, or working. The user should not need to stop, switch tools, manually copy a link, or restate the context to an AI.

## Product Positioning

GotIt! combines several roles in one workflow:

- A screen-aware chat companion
- A smart bookmark and link extractor
- A personal capture tool for Obsidian-style knowledge workflows
- A future stealth-aware assistant for meetings, demos, and interview-style situations

The current product direction is "second brain first, stealth planned from day one." In practice, that means the knowledge-capture workflow is the first product milestone, while stealth rendering remains an important architectural requirement rather than a reason to delay the base workflow.

## Primary User Experience

1. The user triggers GotIt! with a screenshot, a global keybind, or a direct invoke action from the app.
2. If the user provides a screenshot, that image becomes the starting context.
3. If the user uses the keybind, GotIt! captures the current screen, runs vision once, and produces the first result.
4. If the user invokes the tool without a screenshot, the chat panel opens as the main interaction surface.
5. The backend analyzes any captured screen context with AI, prioritizing URLs and links while also extracting OCR text and broader context.
6. A floating chat panel opens with the result or, if no capture has run yet, with the session ready for interaction.
7. The chat panel becomes the hub for follow-up interaction and stays active until dismissed or reset.
8. The user can continue through text, push-to-talk microphone input, system audio capture, new screenshots, or new screen refresh requests.
9. Each new action appends to the current chat session rather than creating a separate conversation by default.
10. If the user asks GotIt! to inspect the screen again, the app performs a new one-shot capture and runs vision again.
11. The user can say "save this for later" and the AI saves to Obsidian from the active session, checking the screen again if needed.
12. The save follows the default system-prompt behavior unless the user overrides the format in chat.
13. The user can reset context at any time to start a fresh session.
14. Sessions are persisted and available later in a history tab.

All interaction paths are valid:

- Screenshot trigger: user explicitly chooses the capture area or image context.
- Keybind trigger: the app captures the current screen automatically, runs vision once, and opens the floating panel with that context ready.
- Direct invoke trigger: the user opens GotIt! without taking a screenshot first, and the panel is available immediately for chat-driven actions.
- Chat refresh trigger: while the panel is open, the user can ask GotIt! to inspect the screen again, which runs a fresh one-shot vision pass.
- Session append behavior: new screenshots, voice inputs, audio captures, and save actions continue the current conversation unless the user resets context.
- Save trigger: the user can ask to save the current thing or link for later, and the AI uses the active session plus an additional screen read if needed.

## Chat Interaction Model

The floating panel is not just a result viewer. It is the main interaction surface for the product.

Once the panel opens, the user can:

- Ask questions about what the AI is seeing
- Ask for TLDRs, summaries, or explanation
- Continue with text input
- Continue with push-to-talk microphone input that ends on silence timeout or manual pause/process
- Add system audio context through "Listen to this," which runs until the user pauses/stops it
- Add another screenshot or ask for another screen read
- Ask the AI to save the content in a specific way
- Keep saving useful items to Obsidian without leaving the same conversation
- Reset context and start a fresh session
- Reopen prior sessions from the history tab

The design assumption is that one conversation may accumulate multiple context sources over time: screen capture, typed prompt, microphone transcript, system audio transcript, repeated screen refreshes, and save actions.

## Core Product Capabilities

| Capability                       | Description                                                                                                     | Feature | Status                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | ------------------------ |
| Screenshot trigger               | User-triggered screenshot opens the chat with image context                                                     | F001    | Planned next sprint      |
| Global keybind trigger           | Keyboard shortcut captures the current screen, runs vision once, and opens the chat                             | F001    | Planned next sprint      |
| Direct invoke chat               | Opening GotIt! without a screenshot opens the panel even before any vision run                                  | F001    | Planned next sprint      |
| Chat-driven screen refresh       | While the panel is open, the user can ask GotIt! to inspect the screen again with a fresh one-shot vision pass  | F001    | Planned next sprint      |
| Active session append            | New captures, inputs, and save actions append to the current chat session by default                            | F001    | Planned next sprint      |
| Reset context                    | User can clear the active chat context and start a fresh session                                                | F001    | Planned next sprint      |
| History tab                      | Persist sessions and let the user reopen prior conversations                                                    | F001    | Planned next sprint      |
| Floating chat panel              | Raycast-style native panel for interacting without leaving context                                              | F001    | Planned next sprint      |
| Screen understanding             | AI extracts URLs, OCR text, app context, and screen summary                                                     | F001    | Planned next sprint      |
| Text chat                        | User asks questions, requests TLDRs, or asks for analysis about the captured context                            | F001    | Planned next sprint      |
| Basic Obsidian save              | Save the current thing or link for later into Obsidian from the active session                                  | F001    | Planned next sprint      |
| System-prompt-guided save format | By default, save formatting follows the system prompt                                                           | F001    | Planned next sprint      |
| Save-format override             | User can override how the save should be formatted directly in chat                                             | F001    | Planned next sprint      |
| Push-to-talk microphone input    | Speak into the chat; processing happens after silence timeout or manual pause/process                           | F001    | Planned next sprint      |
| "Listen to this" mode            | Capture system audio from a video, meeting, or podcast continuously while active until the user pauses/stops it | F001    | Planned next sprint      |
| Advanced Obsidian workflows      | Richer vault configuration, routing, and structured save controls beyond the MVP flow                           | F002    | Blocked by F001          |
| Advanced audio workflows         | Richer transcript UX, device selection, and refined audio controls beyond the MVP inputs                        | F003    | Blocked by F001          |
| Custom system prompt             | Let the user edit how the AI interprets the screen and what it prioritizes                                      | F004    | Blocked by F001          |
| Stealth rendering                | Keep the floating panel hidden from screen sharing and recording tools where supported                          | F005    | Blocked by F001          |
| Save templates                   | User-configurable save formats such as quick save, article summary, or code snippet                             | F006    | Blocked by F002          |
| Windows client                   | Native Windows client using the same backend contracts                                                          | F007    | Blocked by F001 and F002 |
| Notion integration               | Alternative storage destination beyond Obsidian                                                                 | F008    | Icebox                   |
| Local model support              | Privacy-first local inference via Ollama or similar runtimes                                                    | F009    | Icebox                   |
| Browser extension                | Browser companion for richer URL and page-aware capture                                                         | F010    | Icebox                   |
| Advanced history management      | Search, filter, pin, export, and organize persisted sessions beyond the basic MVP history tab                   | F011    | Icebox                   |
| Smart categorization             | Auto-tag and organize saved content                                                                             | F012    | Icebox                   |

## Default AI Behavior

The default screen-understanding behavior is:

- Extract visible URLs, links, references, and source locations first.
- Read visible text through OCR.
- Identify the active context, such as browser content, a Slack thread, code, docs, or media.
- Return a concise, useful summary that the user can question or save.

This behavior is intentionally configurable through a user-editable system prompt so advanced users can tune how GotIt! interprets their screen.

The default mode is full OCR plus contextual understanding, but with URLs and links treated as the first-priority extraction target.

Vision is event-driven, not continuous. Each screen analysis happens because the user supplied a screenshot, used the keybind, or explicitly asked from the chat to inspect the screen again.

Session continuity is persistent by default. The chat remains the durable working context for follow-up prompts, captures, audio inputs, and save operations until the user explicitly resets it.

Audio input is session-active rather than one-shot. Microphone capture ends when the user stops talking for a short period or manually pauses/stops it. "Listen to this" remains active until the user explicitly pauses/stops it.

## AI Delivery Model

The initial delivery model is backend-managed AI.

- The backend owns provider integration, API keys, and billing.
- The client does not require end users to bring their own API keys in the first version.
- Model routing, prompt updates, extraction behavior, and save logic remain server-side.

This keeps the native client thin and allows the AI behavior to evolve without forcing app updates.

## Inputs the User Can Combine

GotIt! is not limited to a single capture mode. The chat can accumulate context from multiple inputs during the same interaction.

- Screen image from screenshot
- Screen image from keybind capture
- Screen image from chat-driven refresh capture
- Typed chat input
- Microphone speech-to-text
- System audio transcription
- Save actions and save instructions

The intended experience is a single conversation that understands both what the user is seeing and what they are hearing.

## Conversation State and History

GotIt! distinguishes between the active session and long-term knowledge saves.

- The active session is the current chat context.
- By default, new user actions append to that active session.
- The user can reset context to start a fresh session.
- Sessions are persisted and shown in a history tab.
- Obsidian saves are deliberate knowledge-capture actions within or from a session, not a replacement for session history.

## Storage and Knowledge Capture

The first plugin and storage target is Obsidian.

The MVP save model is designed around two levels:

- Fast default save for low-friction capture
- Instruction-driven save when the user wants a specific structure or summary style

The default save behavior follows the system prompt. If the user says how the content should be saved, that explicit chat instruction overrides the default format for that save.

Over time, this expands into reusable save templates, richer Obsidian workflows, and additional integrations such as Notion.

The intended default is a simple structured entry when the user gives no extra save instructions. When the user does provide instructions, the AI should adapt the saved output to that request. These saves should still feel like part of the current conversation rather than a separate workflow.

## Architecture

GotIt! follows a Functional Core / Imperative Shell architecture.

- `apps/macos` is the native macOS shell for capture, UI, permissions, and window behavior.
- `packages/api` is the backend shell for AI calls, storage integration, and orchestration.
- `packages/core` contains pure business logic only.
- `packages/shared` contains contracts, schemas, and shared types.

The client stays thin. All AI reasoning, prompt control, storage formatting, and integration behavior live server-side.

This architecture is deliberately chosen so a future Windows client can reuse the same backend contracts and product behavior without duplicating AI logic in each client.

The intended interaction model is Perssua-like in the sense that the app should feel immediately useful and screen-aware, but screen vision itself remains on-demand rather than continuously watching in the background.

## Stealth and Platform Constraints

Stealth behavior is a planned product capability, but it is constrained by platform rules.

- On macOS, the planned path is `NSWindow.sharingType = .none` for hiding the floating panel from capture tools.
- On Windows, the planned path is `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`.
- System permissions for screen capture and audio capture cannot be bypassed.
- Repeated or streaming capture paths may show OS-level indicators depending on platform and API.

This means GotIt! can be designed to stay out of screen sharing where supported, but it still has to respect operating-system privacy and capture restrictions.

## Platform Direction

### macOS

macOS is the first target platform.

- Native client: Swift / SwiftUI
- Minimum recommended target: macOS 13 Ventura
- Primary capture path: one-shot screen capture for the main workflow
- Audio path: ScreenCaptureKit for system audio, AVAudioEngine for microphone
- Stealth path: `NSWindow.sharingType = .none`

### Windows

Windows is planned after the macOS-first workflow is stable.

- Native client direction: C# / WinUI 3
- Recommended minimum: Windows 10 2004
- Stealth path: `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`

## Current Project State

The project is still in pre-development setup.

- The monorepo structure and orchestration rules exist.
- Platform research for macOS and Windows exists under `docs/research/`.
- The feature board exists in `BOARD.md`.
- The first implementation feature is `F001` Screen Capture + Chat MVP.
- Feature specs and implementation plans have not been written yet.

## Development and Harness Model

The project is planned to run under a harness-driven multi-agent workflow.

- Features start in `BOARD.md`.
- Planning flows through brainstorming, spec writing, and implementation planning.
- Implementation work is expected to use spec-driven subagent development.
- A validator agent runs before and after implementation work.
- The validator must run in a clean session and acts as the gatekeeper for dependencies and quality.
- `STATUS.md` is the single source of truth for validated progress.

At a high level, the workflow is:

`BOARD.md -> Brainstorming -> Spec -> Plan -> Sprint Contract -> Implementation -> Validation -> STATUS.md`

## Feature Roadmap

### Foundation

- F001 Screen Capture + Chat MVP
- F002 Advanced Obsidian Workflows
- F003 Advanced Audio Workflows
- F004 Custom System Prompt UI
- F005 Stealth Rendering

### Workflow Expansion

- F006 Save Templates
- F007 Windows Client

### Longer-Term Extensions

- F008 Notion Integration
- F009 Local Model Support
- F010 Browser Extension
- F011 Advanced History Management
- F012 Smart Categorization

## Source of Truth

Use these files together:

- `AGENTS.md` for architecture and harness rules
- `BOARD.md` for feature backlog and dependencies
- `STATUS.md` for validated progress
- `docs/research/` for platform constraints
