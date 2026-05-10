# Instant Screenshot Detection on macOS

**Goal:** Detect when a screenshot is triggered at the moment of keypress — before the file is saved to disk — so the panel can pop up immediately.

**Date:** 2026-05-10

---

## Background

`screencaptureui` writes to `$TMPDIR/TemporaryItems/NSIRD_screencaptureui_*/` within ~200–500ms of the keypress. The file is only moved to `~/Desktop` when the thumbnail dismisses (~5s). Our current FSEvents watcher on Desktop fires at the end of that window, causing the delay.

---

## Mechanisms Evaluated

### 1. CGEventTap (listen-only) ✅ Recommended

Tap `kCGHIDEventTap` for `kCGEventKeyDown` with Cmd+Shift+3/4/5. Fires at ~0ms latency from the keypress — before `screencaptureui` even launches.

- **Latency:** ~0ms (keypress)
- **Permission:** Input Monitoring (one-time user prompt)
- **Reliability:** Excellent — same mechanism used by Shottr, BetterTouchTool
- **Mode:** `kCGEventTapOptionListenOnly` — observe but don't consume, system screenshot still fires normally
- **Key codes:** 20 = `3`, 21 = `4`, 23 = `5` — filter on Cmd+Shift modifier flags

Implementation notes:

- `CGEventTapCreate` returns `nil` without permission — check with `CGPreflightListenEventAccess()`, prompt with `CGRequestListenEventAccess()`
- Run the tap on a dedicated thread with its own `CFRunLoop`
- Handle `kCGEventTapDisabledByTimeout` in the callback to re-enable the tap
- No entitlement keys needed in `.entitlements` for non-sandboxed apps

### 2. FSEvents on `$TMPDIR/TemporaryItems` ✅ Good fallback

Watch the temp directory with `kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer`. Fires when `screencaptureui` creates the `NSIRD_screencaptureui_*/` subdirectory and flushes the PNG.

- **Latency:** ~200–500ms after keypress
- **Permission:** None (non-sandboxed)
- **Reliability:** Good — fires well before thumbnail dismissal
- **Gotcha:** `$TMPDIR` must be resolved at runtime via `NSTemporaryDirectory()` — never hardcode `/var/folders/…`. Set `kFSEventStreamCreateFlagWatchRoot` to survive path changes.

### 3. NSWorkspace `didLaunchApplicationNotification` ⚠️ Uncertain

`screencaptureui` launches on-demand when a screenshot shortcut fires and quits after thumbnail dismissal. Listen for `NSWorkspace.didLaunchApplicationNotification` filtering by bundle ID `com.apple.screencaptureui`.

- **Latency:** ~50–150ms after keypress
- **Permission:** None
- **Reliability:** Uncertain on macOS Sequoia — Apple may suppress it from NSWorkspace in some configurations. Needs testing.

### 4. Distributed Notifications ❌ Dead end

No public distributed notification is posted by `com.apple.screencaptureui` or `com.apple.screencapture` at capture time. Confirmed by observing all distributed notifications containing "screen" or "capture" during a live screenshot — nothing fired. `screencaptureui` uses internal XPC (private, not documented).

### 5. IOHIDManager ❌ Redundant

Same `Input Monitoring` permission as CGEventTap, lower-level API, harder to filter modifiers. No advantage over CGEventTap.

### 6. XPC / Private APIs ❌ Not actionable

`screencaptureui` uses internal XPC (`OS_xpc_object` protocol, class names `CommandShift4ViewController` etc. visible in headers). No public or leaked XPC service names. Requires SIP-disabled or kernel extensions — non-starter.

### 7. Polling `$TMPDIR/TemporaryItems` at 100ms ⚠️ Viable fallback only

- **Latency:** ~200–600ms worst case
- **Permission:** None
- **Reliability:** Reliable but busy-polling anti-pattern when FSEvents is available

---

## Recommended Implementation: Two-Stage

**Stage 1 — CGEventTap (instant):**
Tap Cmd+Shift+3/4/5 at keypress. Pop the panel immediately with a "Screenshot incoming…" placeholder UI (`isAwaitingScreenshot` state).

**Stage 2 — FSEvents on `$TMPDIR/TemporaryItems` (~200–500ms):**
When `NSIRD_screencaptureui_*/Screenshot.png` appears, load the image and transition to normal processing UI (thumbnail preview + grace period + API call).

This gives zero-latency panel popup while the image loads in the background.

---

## Ranked Summary

| Rank | Mechanism                            | Latency    | Permission       | Notes                         |
| ---- | ------------------------------------ | ---------- | ---------------- | ----------------------------- |
| 1    | CGEventTap listen-only               | ~0ms       | Input Monitoring | Best — use as primary trigger |
| 2    | NSWorkspace didLaunchApplication     | ~50–150ms  | None             | Uncertain on Sequoia          |
| 3    | FSEvents on `$TMPDIR/TemporaryItems` | ~200–500ms | None             | Use as file-ready signal      |
| 4    | Polling `$TMPDIR` at 100ms           | ~200–600ms | None             | Last resort fallback          |
| 5    | Distributed notifications            | —          | —                | Dead end                      |
| 6    | IOHIDManager                         | ~0ms       | Input Monitoring | Redundant vs CGEventTap       |
| 7    | XPC / private APIs                   | —          | —                | Not actionable                |
