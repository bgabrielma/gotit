import SwiftUI

struct PendingMessageRow: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Spacer(minLength: 24)
                Text(text)
                    .padding(8)
                    .background(Color.accentColor.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            HStack {
                TypingIndicator()
                    .padding(8)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Spacer(minLength: 24)
            }
        }
    }
}
