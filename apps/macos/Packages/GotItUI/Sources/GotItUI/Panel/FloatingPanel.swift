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

    public override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown && event.keyCode == 53 { orderOut(nil); return }
        super.sendEvent(event)
    }

    public func toggle(near point: CGPoint? = nil) {
        if isVisible { orderOut(nil); return }
        show(near: point)
    }

    /// Show and steal keyboard focus — safe to call even when already visible.
    public func show(near point: CGPoint? = nil) {
        if let point { setFrameTopLeftPoint(point) }
        else if !isVisible { centerInActiveScreen() }
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
