import SwiftUI
import UniformTypeIdentifiers
import GotItModels
import GotItInfra

public struct ChatView: View {
    @ObservedObject var panel: PanelViewModel
    @ObservedObject var chat: ChatViewModel
    @State private var draft: String = ""
    @State private var isOnline: Bool = true
    private let bottomAnchorID = "chat-bottom-anchor"

    private static let imageTypes: [UTType] = [.image, .png, .jpeg, .heic, .gif, .webP]

    public init(panel: PanelViewModel) {
        self.panel = panel
        self.chat = panel.chat
    }

    public var body: some View {
        let isInteractionBlocked = panel.isWorking || chat.isSending || panel.isShowingPermissionPrompt || panel.isAwaitingScreenshot

        VStack(spacing: 0) {
            // Space for the transparent title bar / window controls
            Spacer().frame(height: 28)
            if !isOnline { OfflineBanner() }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading) {
                        ForEach(Array(chat.messages.enumerated()), id: \.offset) { _, m in
                            MessageRow(m)
                        }
                        if let pending = chat.pendingUserText {
                            PendingMessageRow(text: pending)
                        }
                        if panel.isAwaitingScreenshot {
                            AwaitingScreenshotRow()
                        }
                        if let capture = panel.pendingCaptureImage {
                            CapturePreviewRow(imageData: capture)
                        }
                        Color.clear
                            .frame(height: 1)
                            .id(bottomAnchorID)
                    }
                    .padding(8)
                }
                .frame(minHeight: 220)
                .onAppear {
                    scrollToBottom(using: proxy)
                }
                .onChange(of: chat.messages.count) { _ in
                    scrollToBottom(using: proxy)
                }
                .onChange(of: chat.pendingUserText != nil) { _ in
                    scrollToBottom(using: proxy)
                }
                .onChange(of: panel.pendingCaptureImage != nil) { _ in
                    scrollToBottom(using: proxy)
                }
                .onChange(of: panel.isAwaitingScreenshot) { _ in
                    scrollToBottom(using: proxy)
                }
                .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
                    scrollToBottom(using: proxy)
                }
                // Step 22.1: drag-drop images onto the chat area
                .onDrop(of: Self.imageTypes, isTargeted: nil) { providers in
                    if isInteractionBlocked {
                        return false
                    }
                    for provider in providers {
                        for type in Self.imageTypes {
                            if provider.hasItemConformingToTypeIdentifier(type.identifier) {
                                _ = provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                                    if let data { Task { await panel.sendCapture(image: data, source: .invoke) } }
                                }
                                break
                            }
                        }
                    }
                    return true
                }
            }

            Divider()

            if let event = panel.events.last {
                switch event {
                case .toast(let text):
                    NotificationBar(icon: "camera", text: text,
                                    autoDismissAfter: 5, onDismiss: { panel.dismissToast() })
                case .savedTo(let url):
                    NotificationBar(
                        icon: "checkmark.circle.fill",
                        text: Copy.savedTo(url.lastPathComponent),
                        tint: .green,
                        autoDismissAfter: 5,
                        onDismiss: { panel.dismissToast() },
                        onAction: {
                            let encoded = url.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? url.path
                            if let obsidianURL = URL(string: "obsidian://open?path=\(encoded)"),
                               NSWorkspace.shared.open(obsidianURL) { return }
                            NSWorkspace.shared.activateFileViewerSelecting([url])
                        }
                    )
                case .permissionRequired(.screenRecording):
                    PermissionPrompt(
                        title: Copy.screenRecordingTitle,
                        message: Copy.screenRecordingMessage,
                        cta: Copy.screenRecordingCta
                    ) {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                    .padding(.horizontal, 8).padding(.top, 4)
                case .permissionRequired(.vaultFolder):
                    PermissionPrompt(
                        title: Copy.vaultFolderTitle,
                        message: Copy.vaultFolderMessage,
                        cta: Copy.vaultFolderCta
                    ) {
                        if let url = VaultFolderPicker.choose() { panel.didChooseVaultFolder(url) }
                    }
                    .padding(.horizontal, 8).padding(.top, 4)
                case .reconnectRequired:
                    PermissionPrompt(
                        title: Copy.reconnectTitle,
                        message: Copy.reconnectMessage,
                        cta: Copy.reconnectCta
                    ) { }
                    .padding(.horizontal, 8).padding(.top, 4)
                case .error(let s):
                    NotificationBar(icon: "exclamationmark.circle", text: s, tint: .red,
                                    autoDismissAfter: 5, onDismiss: { panel.dismissToast() })
                case .offlineChanged:
                    EmptyView()
                }
            }

            InputBar(
                text: $draft,
                onSend: {
                    guard !panel.isShowingPermissionPrompt else { return }
                    Task { await panel.chat.send(text: draft); draft = "" }
                },
                // Step 22.3: paperclip file picker
                onAttach: {
                    guard !panel.isShowingPermissionPrompt else { return }
                    let picker = NSOpenPanel()
                    picker.allowedContentTypes = [.png, .jpeg, .heic, .gif, .webP]
                    picker.allowsMultipleSelection = false
                    if picker.runModal() == .OK, let url = picker.url, let data = try? Data(contentsOf: url) {
                        Task { await panel.sendCapture(image: data, source: .invoke) }
                    }
                },
                onLookAgain: {
                    guard !panel.isShowingPermissionPrompt else { return }
                    Task { await panel.lookAgain() }
                },
                onSave: {
                    guard !panel.isShowingPermissionPrompt else { return }
                    Task { await panel.save(instruction: nil) }
                },
                onReset: {
                    guard !panel.isShowingPermissionPrompt else { return }
                    Task { await panel.chat.reset() }
                },
                isBusy: isInteractionBlocked
            )
        }
        .frame(width: 460)
        // Step 22.2: ⌘V paste — intercepts only when clipboard contains image data
        .background(
            Button("") {
                guard !panel.isShowingPermissionPrompt else { return }
                if let data = NSPasteboard.general.data(forType: .tiff) ??
                               NSPasteboard.general.data(forType: .png) {
                    Task { await panel.sendCapture(image: data, source: .invoke) }
                }
            }
            .keyboardShortcut("v", modifiers: .command)
            .hidden()
        )
    }

    private func scrollToBottom(using proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(bottomAnchorID, anchor: .bottom)
        }
    }
}

private struct AwaitingScreenshotRow: View {
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "camera")
                .font(.system(size: 13))
                .opacity(pulse ? 0.3 : 1.0)
                .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
            Text(Copy.awaitingScreenshot)
                .font(.callout)
                .foregroundStyle(.secondary)
            Spacer(minLength: 24)
        }
        .padding(8)
        .onAppear { pulse = true }
    }
}
