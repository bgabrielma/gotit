import SwiftUI

public struct ToastView: View {
    public let text: String
    public let onTap: (() -> Void)?
    public init(_ text: String, onTap: (() -> Void)? = nil) { self.text = text; self.onTap = onTap }
    public var body: some View {
        Text(text)
            .padding(8)
            .background(.thinMaterial)
            .clipShape(Capsule())
            .onTapGesture { onTap?() }
    }
}

public struct PermissionPrompt: View {
    public let title: String
    public let message: String
    public let cta: String
    public let action: () -> Void
    public init(title: String, message: String, cta: String, action: @escaping () -> Void) {
        self.title = title; self.message = message; self.cta = cta; self.action = action
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(message).font(.body)
            Button(cta, action: action)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
