# macOS Native API Reference

> Platform research for GotIt! macOS client. Last updated: 2026-04-28.

## 1. Screen Capture

**ScreenCaptureKit (macOS 12.3+)** — modern choice. Per-window and per-app filtering, hardware encoding, supports screenshots and streams.

**CGWindowListCreateImage (macOS 10.5+)** — legacy Core Graphics. Simpler for one-shot screenshots. No streaming.

**Permissions:** Both require Screen Recording permission (`NSScreenCaptureUsageDescription` in Info.plist + user approval in System Settings > Privacy & Security > Screen Recording). No programmatic bypass.

**Orange recording indicator:** Starting in macOS 14 Sonoma, the system shows an amber indicator in the menu bar whenever `SCStream` is active. **Cannot be suppressed.** One-shot `CGWindowListCreateImage` calls do NOT trigger it — only continuous streams.

**Recommendation:** Use `CGWindowListCreateImage` for one-shot captures (our primary use case). Reserve `SCStream` only for "Listen to this" audio capture mode.

## 2. System Audio Capture

**ScreenCaptureKit audio (macOS 13+):** `SCStreamConfiguration` with `capturesAudio = true`. Can capture audio from specific apps via `SCContentFilter`.

**Permissions:** Same Screen Recording permission as video. No separate audio-only permission — even audio-only capture requires Screen Recording authorization.

**Per-app audio filtering:** Reliable on macOS 14+ (`excludesCurrentProcessAudio` and app-level filtering).

**Hard blocker:** No public API for system audio without Screen Recording permission. The orange indicator appears for audio-only streams too.

## 3. Microphone Access

**APIs:** `AVAudioEngine` (high-level, preferred) or `AVCaptureDevice` (lower-level).

**Permissions:** `NSMicrophoneUsageDescription` in Info.plist. User grants via System Settings > Privacy & Security > Microphone. Use `AVCaptureDevice.requestAccess(for: .audio)` to trigger prompt.

**Note:** Microphone permission is independent of Screen Recording. Need both for mic + system audio. Works on macOS 10.14+.

## 4. Global Keyboard Shortcuts

**`RegisterEventHotKey` (Carbon API)** — what most menu bar apps use. Wrapped by open-source libraries like `MASShortcut` or `HotKey`. Does NOT require Accessibility permission. Works when other apps are focused. Supports modifier+key combos.

**`NSEvent.addGlobalMonitorForEvents`** — monitors key events when app is NOT focused. Read-only. Requires Accessibility permission on macOS 10.15+.

**`CGEvent.tapCreate`** — can intercept and consume events. Requires Accessibility permission.

**Recommendation:** Use `RegisterEventHotKey` (via `HotKey` library) — no permissions needed, well-tested pattern.

**Gotcha:** Some combos are system-reserved (Cmd+Space, Cmd+Tab). Secure input mode (password fields) blocks `CGEvent` taps.

## 5. Stealth Rendering

**`NSWindow.sharingType = .none`** (macOS 10.10+) — the official, supported way. Windows appear as **blank/black rectangles** in screen recordings and sharing apps.

```swift
window.sharingType = .none
```

**Reliable on macOS 13+** across all capture methods (Zoom, Teams, Meet, OBS).

**`NSWindow.level`** — controls z-ordering only. Irrelevant for stealth.

**`CGSSetWindowLevel`** — private SPI. Do not use. Blocks notarization.

## 6. Menu Bar App Architecture

**`NSStatusItem`** — menu bar icon. Standard, no special permissions.

**`NSPanel` (Raycast-style)** — the recommended approach for floating chat panels:

```swift
let panel = NSPanel(...)
panel.styleMask = [.borderless, .nonactivatingPanel]
panel.level = .floating
panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
panel.isMovableByWindowBackground = false
panel.hidesOnDeactivate = false
```

Does not steal focus from current app. Fully custom-styled. Appears above other windows.

**Gotcha:** Text fields inside `.nonactivatingPanel` don't receive key events by default. Override `canBecomeKey` to return `true` on the panel.

## 7. Distribution

| Method        | Requirement                    | User Experience                      |
| ------------- | ------------------------------ | ------------------------------------ |
| App Store     | $99/yr Apple Developer Program | Clean, trusted                       |
| Notarized DMG | $99/yr Apple Developer Program | Clean, no warnings                   |
| Ad-hoc signed | Free Apple ID                  | Gatekeeper warnings, manual override |

**Hard blocker for clean distribution:** $99/yr is required. Without it, users see "unidentified developer" warnings and must manually allow the app.

On macOS 15 Sequoia, Apple tightened Gatekeeper further — stronger warnings for unsigned apps.

## Summary of Hard Blockers

| Capability                           | Hard Blocker                         | Minimum OS |
| ------------------------------------ | ------------------------------------ | ---------- |
| Screen capture streaming             | Orange indicator (can't hide)        | 12.3       |
| System audio capture                 | Requires Screen Recording permission | 13.0       |
| Per-app audio filtering              | —                                    | 14.0       |
| Microphone                           | User permission required             | 10.14      |
| Global hotkeys (RegisterEventHotKey) | None                                 | 10.6       |
| Stealth window (sharingType .none)   | Reliable blanking across all paths   | 13.0       |
| Notarization                         | $99/yr paid developer account        | 10.15      |

**Recommended minimum deployment target: macOS 13 Ventura** — gives ScreenCaptureKit audio, reliable stealth blanking, and covers ~95% of active Macs.
