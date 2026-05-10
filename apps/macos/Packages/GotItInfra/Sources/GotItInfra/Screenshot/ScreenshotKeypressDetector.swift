import Cocoa
import CoreGraphics

/// Listens (read-only) for the full-screen screenshot shortcut (Cmd+Shift+3) via CGEventTap.
/// Requires Input Monitoring permission. Falls back silently if permission is denied.
public final class ScreenshotKeypressDetector: @unchecked Sendable {
    /// Virtual key code for "3" on a standard keyboard (Cmd+Shift+3 = full-screen capture).
    private static let keyCodeFullScreen: Int64 = 20
    private var continuation: AsyncStream<Void>.Continuation?
    private var stream: AsyncStream<Void>?
    // Exposed as `var` so the tap-disabled callback can re-enable it via `self.tap`.
    var tap: CFMachPort?

    public init() {}

    public func keypresses() -> AsyncStream<Void> {
        if let s = stream { return s }
        let s = AsyncStream<Void> { self.continuation = $0 }
        stream = s
        return s
    }

    public func start() {
        guard CGPreflightListenEventAccess() else {
            CGRequestListenEventAccess()
            return
        }
        installTap()
    }

    public func stop() {
        guard let t = tap else { return }
        CGEvent.tapEnable(tap: t, enable: false)
        tap = nil
    }

    // MARK: - Private

    private func installTap() {
        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()

        let cb: CGEventTapCallBack = { _, type, event, refcon in
            guard let refcon else { return Unmanaged.passRetained(event) }
            let d = Unmanaged<ScreenshotKeypressDetector>.fromOpaque(refcon).takeUnretainedValue()
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let t = d.tap { CGEvent.tapEnable(tap: t, enable: true) }
                return Unmanaged.passRetained(event)
            }
            d.handle(event)
            return Unmanaged.passRetained(event)
        }

        guard let t = CGEvent.tapCreate(
            tap: .cghidEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: cb,
            userInfo: selfPtr
        ) else { return }

        tap = t
        let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
        CGEvent.tapEnable(tap: t, enable: true)
    }

    private func handle(_ event: CGEvent) {
        guard event.getIntegerValueField(.keyboardEventKeycode) == Self.keyCodeFullScreen else { return }
        let flags = event.flags
        guard flags.contains(.maskCommand) && flags.contains(.maskShift) else { return }
        continuation?.yield()
    }
}
