import SwiftUI
import UniformTypeIdentifiers
import GotItModels
import GotItInfra

public struct ChatView: View {
    @ObservedObject var panel: PanelViewModel
    @State private var draft: String = ""
    @State private var isOnline: Bool = true

    private static let imageTypes: [UTType] = [.image, .png, .jpeg, .heic, .gif, .webP]

    public init(panel: PanelViewModel) { self.panel = panel }

    public var body: some View {
        VStack(spacing: 0) {
            if !isOnline { OfflineBanner() }
            ScrollView {
                LazyVStack(alignment: .leading) {
                    ForEach(Array(panel.chat.messages.enumerated()), id: \.offset) { _, m in
                        MessageRow(m)
                    }
                }
                .padding(8)
            }
            .frame(minHeight: 220)
            // Step 22.1: drag-drop images onto the chat area
            .onDrop(of: Self.imageTypes, isTargeted: nil) { providers in
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

            Divider()

            InputBar(
                text: $draft,
                onSend: { Task { await panel.chat.send(text: draft); draft = "" } },
                // Step 22.3: paperclip file picker
                onAttach: {
                    let picker = NSOpenPanel()
                    picker.allowedContentTypes = [.png, .jpeg, .heic, .gif, .webP]
                    picker.allowsMultipleSelection = false
                    if picker.runModal() == .OK, let url = picker.url, let data = try? Data(contentsOf: url) {
                        Task { await panel.sendCapture(image: data, source: .invoke) }
                    }
                },
                onLookAgain: { Task { await panel.lookAgain() } },
                onSave: { Task { await panel.save(instruction: nil) } },
                onReset: { Task { await panel.chat.reset() } },
                isBusy: panel.isWorking || panel.chat.isSending
            )
        }
        .frame(width: 460)
        // Step 22.2: ⌘V paste — intercepts only when clipboard contains image data
        .background(
            Button("") {
                if let data = NSPasteboard.general.data(forType: .tiff) ??
                               NSPasteboard.general.data(forType: .png) {
                    Task { await panel.sendCapture(image: data, source: .invoke) }
                }
            }
            .keyboardShortcut("v", modifiers: .command)
            .hidden()
        )
    }
}
