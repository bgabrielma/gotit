import SwiftUI

public struct NotificationBar: View {
    let icon: String
    let text: String
    var tint: Color = .accentColor
    var autoDismissAfter: TimeInterval? = nil
    var onDismiss: (() -> Void)? = nil
    var onAction: (() -> Void)? = nil

    @State private var opacity: Double = 0
    @State private var yOffset: CGFloat = 6
    @State private var isDismissing = false
    @State private var autoDismissTask: Task<Void, Never>? = nil

    public init(icon: String, text: String, tint: Color = .accentColor,
                autoDismissAfter: TimeInterval? = nil,
                onDismiss: (() -> Void)? = nil,
                onAction: (() -> Void)? = nil) {
        self.icon = icon; self.text = text; self.tint = tint
        self.autoDismissAfter = autoDismissAfter
        self.onDismiss = onDismiss; self.onAction = onAction
    }

    public var body: some View {
        HStack(spacing: 12) {
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

            if onAction != nil {
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
        .opacity(opacity)
        .offset(y: yOffset)
        .onAppear {
            withAnimation(.easeOut(duration: 0.2)) { opacity = 1; yOffset = 0 }
            if let delay = autoDismissAfter {
                autoDismissTask = Task {
                    try? await Task.sleep(for: .seconds(delay))
                    await fadeOut()
                }
            }
        }
        .onDisappear { autoDismissTask?.cancel() }
        .contentShape(Rectangle())
        .onTapGesture {
            onAction?()
            Task { await fadeOut() }
        }
    }

    @MainActor
    private func fadeOut() async {
        guard !isDismissing else { return }
        isDismissing = true
        withAnimation(.easeOut(duration: 0.25)) { opacity = 0 }
        try? await Task.sleep(for: .seconds(0.25))
        onDismiss?()
    }
}
