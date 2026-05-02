import SwiftUI
import GotItModels

public struct MessageRow: View {
    let message: Message
    public init(_ message: Message) { self.message = message }
    public var body: some View {
        switch message {
        case .userText(let p): bubble(text: p.text, role: .user)
        case .assistant(let p): bubble(text: p.text, role: .assistant)
        case .screenCapture(let p): bubble(text: "📷 " + p.analysis.summary, role: .assistant)
        case .saveRecord(let p): bubble(text: "💾 saved: " + p.vaultPath, role: .assistant)
        }
    }
    private enum Role { case user, assistant }
    private func bubble(text: String, role: Role) -> some View {
        HStack {
            if role == .user { Spacer(minLength: 24) }
            Text(text)
                .padding(8)
                .background(role == .user ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if role == .assistant { Spacer(minLength: 24) }
        }
    }
}
