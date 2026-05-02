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
                case .reconnectRequired:
                    PermissionPrompt(title: "Reconnect required.",
                        message: "Your device session expired.", cta: "Retry") { /* wired by app */ }
                        .padding()
                case .permissionRequired(.screenRecording):
                    PermissionPrompt(title: "Screen Recording needed",
                        message: "Look again needs Screen Recording permission.",
                        cta: "Open System Settings") {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                            NSWorkspace.shared.open(url)
                        }
                    }.padding()
                case .permissionRequired(.vaultFolder):
                    PermissionPrompt(title: "Choose your captures folder",
                        message: "GotIt! saves Markdown files into a folder you pick.",
                        cta: "Choose…") { /* wired by app */ }.padding()
                case .offlineChanged: EmptyView()
                case .error(let s): ToastView("Error: \(s)").padding()
                }
            }
        }
    }
}
