import AppKit
import SwiftUI

/**
 * Transparent NSView overlay that handles click + hover cursor entirely in AppKit,
 * bypassing SwiftUI gesture recognisers (which ScrollView intercepts).
 */
struct ImageClickOverlay: NSViewRepresentable {
    let action: () -> Void

    func makeNSView(context: Context) -> HitView { HitView(action: action) }
    func updateNSView(_ v: HitView, context: Context) { v.action = action }

    final class HitView: NSView {
        var action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
            super.init(frame: .zero)
            wantsLayer = true
            layer?.backgroundColor = NSColor.clear.cgColor
        }

        required init?(coder: NSCoder) { fatalError() }

        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

        override func hitTest(_ point: NSPoint) -> NSView? {
            bounds.contains(point) ? self : nil
        }

        override func updateTrackingAreas() {
            super.updateTrackingAreas()
            trackingAreas.forEach { removeTrackingArea($0) }
            addTrackingArea(NSTrackingArea(
                rect: bounds,
                options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                owner: self
            ))
        }

        override func mouseEntered(with event: NSEvent) { NSCursor.pointingHand.push() }
        override func mouseExited(with event: NSEvent) { NSCursor.pop() }
        override func mouseDown(with event: NSEvent) { DispatchQueue.main.async { self.action() } }
    }
}

/** Standalone window for inspecting a screenshot. Supports pinch-to-zoom and toolbar zoom buttons. */
final class ImagePreviewPanel: NSPanel {
    private static var live: [ImagePreviewPanel] = []

    static func show(image: NSImage) {
        let panel = ImagePreviewPanel(image: image)
        live.append(panel)
        panel.center()
        panel.makeKeyAndOrderFront(nil)
    }

    private init(image: NSImage) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 520),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        self.title = "Screenshot"
        self.isReleasedWhenClosed = false
        self.contentView = NSHostingView(rootView: ImagePreviewView(image: image))
    }

    override func close() {
        super.close()
        Self.live.removeAll { $0 === self }
    }
}

private struct ImagePreviewView: View {
    let image: NSImage

    @State private var scale: CGFloat = 1.0
    @GestureState private var liveScale: CGFloat = 1.0

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            ScrollView([.horizontal, .vertical]) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale * liveScale)
                    .gesture(
                        MagnificationGesture()
                            .updating($liveScale) { value, state, _ in state = value }
                            .onEnded { value in
                                scale = min(5, max(0.1, scale * value))
                            }
                    )
                    .padding(16)
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: 8) {
            Spacer()
            Button { scale = max(0.1, scale - 0.25) } label: {
                Image(systemName: "minus.magnifyingglass")
            }
            .buttonStyle(.borderless)
            Button { scale = 1.0 } label: {
                Image(systemName: "1.magnifyingglass")
            }
            .buttonStyle(.borderless)
            Button { scale = min(5, scale + 0.25) } label: {
                Image(systemName: "plus.magnifyingglass")
            }
            .buttonStyle(.borderless)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
