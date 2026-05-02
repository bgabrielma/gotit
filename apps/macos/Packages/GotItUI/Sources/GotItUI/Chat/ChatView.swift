import SwiftUI
import GotItModels
import GotItInfra

public struct ChatView: View {
    @ObservedObject var panel: PanelViewModel
    @State private var draft: String = ""
    @State private var isOnline: Bool = true

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

            Divider()

            InputBar(
                text: $draft,
                onSend: { Task { await panel.chat.send(text: draft); draft = "" } },
                onAttach: { /* hooked in Task 22 */ },
                onLookAgain: { Task { await panel.lookAgain() } },
                onSave: { Task { await panel.save(instruction: nil) } },
                onReset: { Task { await panel.chat.reset() } },
                isBusy: panel.isWorking || panel.chat.isSending
            )
        }
        .frame(width: 460)
    }
}
