# Windows Native API Reference

> Platform research for GotIt! Windows client (future — F007). Last updated: 2026-04-28.

## 1. Screen Capture

**Windows.Graphics.Capture (WGC)** — Min: Windows 10 1903 (build 18362). Requires one-time user consent via system picker dialog (cannot bypass). Yellow border on Win10; suppressible on Win11 22H2+ via `GraphicsCaptureSession.IsBorderRequired = false`. GPU-accelerated (DXGI).

**BitBlt / GDI** — Legacy. No consent prompt, no indicator. Silent capture. Cannot reliably capture hardware-accelerated/DWM content (black regions). Cannot capture UWP/WinUI windows.

**Hard blocker:** WGC picker dialog cannot be silently dismissed — user must select what to share at least once.

**Recommendation:** WGC for production. BitBlt only as fallback for pre-1903 systems.

## 2. System Audio Capture

**WASAPI Loopback** — Min: Windows Vista+. No permissions dialog. Captures mixed output of default audio endpoint. **Cannot capture per-app audio natively.**

**AudioGraph API (per-app)** — Min: Windows 10 2004 (build 19041). Win11 22H2 introduced `AudioPlaybackMonitor` for per-process isolation, but API is sparse/semi-internal.

**No permissions required** for loopback capture.

## 3. Microphone Access

**WASAPI / MediaCapture** — Min: Vista+ (WASAPI), Win10 (MediaCapture UWP).

Win10 1803+ enforces system-level microphone privacy toggle (Settings > Privacy > Microphone). Desktop (Win32) apps allowed by default but users can revoke globally. **No runtime consent dialog** for Win32 apps — silently fails if global toggle is off.

Win11 shows microphone-in-use indicator in taskbar (cannot hide).

**Gotcha:** MSIX-packaged apps must declare `microphone` capability and trigger consent prompt.

## 4. Global Keyboard Shortcuts

**RegisterHotKey (Win32)** — Works globally. Returns `WM_HOTKEY` to message loop. Only one app per hotkey combo. No elevation required.

**Reserved combos:** Win+L (lock), Win+U, Ctrl+Alt+Del are system-reserved.

**Gotcha:** Does not work on secure desktop (UAC/lock screen).

## 5. Stealth Rendering

**`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`** — Min: **Windows 10 2004 (build 19041)**. Makes window invisible to ALL capture methods (WGC, BitBlt, OBS, Zoom, Teams, Meet). Reliable.

**`WDA_MONITOR`** (Win7+) — older flag, inconsistent across capture tools.

**Gotcha:** Window also invisible to your own screen recordings. Cannot toggle per-capturer. Some accessibility tools lose visibility.

## 6. System Tray & Floating Panel

**NotifyIcon (Shell_NotifyIcon)** — Standard approach. WinUI 3 has no built-in tray icon; use `H.NotifyIcon.WinUI` or P/Invoke.

**Floating panel (Raycast-style):**

- Borderless `WS_EX_TOOLWINDOW | WS_EX_TOPMOST` popup
- `WS_EX_TOOLWINDOW` hides from Alt+Tab and taskbar
- Apply `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` for stealth
- Use `WM_ACTIVATEAPP` / `WM_KILLFOCUS` to auto-dismiss

## 7. Distribution

| Method       | Pros                                                    | Cons                                                     |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| MSIX         | Auto-update, clean install/uninstall, MS Store eligible | Sandboxed; some Win32 APIs restricted. Requires signing. |
| MSI          | Full Win32 access, enterprise GPO deployment            | No built-in auto-update.                                 |
| Portable EXE | Zero install friction                                   | SmartScreen blocks unsigned; no auto-update.             |

**Code signing:** EV cert ($200-400/yr) bypasses SmartScreen immediately. OV certs ($100-300/yr) need reputation building (weeks of downloads). **Unsigned = hard blocker for user trust.**

## Recommended Tech Stack

**C# / WinUI 3 (Windows App SDK):**

- Native `Windows.Graphics.Capture` access without interop
- Full Win32 interop via P/Invoke and `CsWin32` source generator
- WASAPI via `NAudio` NuGet
- Modern XAML with rounded corners, acrylic/mica backdrop
- Ships as unpackaged (full Win32 freedom) or MSIX
- Min OS: Windows 10 1809+ (App SDK 1.x)

**Avoid:** Pure WPF (can't use WinRT capture APIs cleanly). Pure C++/Win32 (3-5x slower for UI work).

## Summary of Hard Blockers

| Capability                       | Hard Blocker                             | Minimum OS |
| -------------------------------- | ---------------------------------------- | ---------- |
| WGC screen capture               | One-time user picker consent (no bypass) | Win10 1903 |
| Per-app audio capture            | No clean public API before Win11         | Win11 22H2 |
| Microphone                       | System privacy toggle can block silently | Win10 1803 |
| Global hotkeys                   | Some combos reserved                     | Any        |
| Stealth (WDA_EXCLUDEFROMCAPTURE) | —                                        | Win10 2004 |
| Clean distribution               | EV code signing cert ($200-400/yr)       | Any        |

**Recommended minimum: Windows 10 2004 (build 19041)** — gives WGC, stealth rendering, and covers majority of active Windows installs.
