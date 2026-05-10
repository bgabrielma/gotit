import SwiftUI

public struct NotificationBar: View {
    let icon: String
    let text: String
    var tint: Color = .accentColor
    var onTap: (() -> Void)? = nil

    @State private var appeared = false

    public init(icon: String, text: String, tint: Color = .accentColor, onTap: (() -> Void)? = nil) {
        self.icon = icon; self.text = text; self.tint = tint; self.onTap = onTap
    }

    public var body: some View {
        HStack(spacing: 12) {
            // Colored icon pill
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 32, height: 32)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer(minLength: 0)

            if onTap != nil {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            RoundedRectangle(cornerRadius: 10)
                .fill(tint.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(tint.opacity(0.25), lineWidth: 1)
                )
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 6)
        .onAppear {
            withAnimation(.easeOut(duration: 0.2)) { appeared = true }
        }
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
    }
}
