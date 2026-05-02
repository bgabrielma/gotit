import SwiftUI

public struct FirstRunBackendStep: View {
    @State private var url: String
    let defaultURL: URL
    let onConnect: (URL) -> Void
    let onSkip: () -> Void
    public init(defaultURL: URL, onConnect: @escaping (URL) -> Void, onSkip: @escaping () -> Void) {
        self.defaultURL = defaultURL; self._url = State(initialValue: defaultURL.absoluteString)
        self.onConnect = onConnect; self.onSkip = onSkip
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Welcome to GotIt!").font(.title2)
            Text("GotIt! captures your screen on demand and chats about what it sees.")
            TextField("Backend URL", text: $url)
            HStack {
                Button("Connect") { if let u = URL(string: url) { onConnect(u) } }
                    .keyboardShortcut(.defaultAction)
                Button("Try without backend", action: onSkip)
            }
        }
        .padding()
        .frame(width: 460)
    }
}
