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
            Text(Copy.onboardingTitle).font(.title2)
            Text(Copy.onboardingDescription)
            TextField(Copy.onboardingURLPlaceholder, text: $url)
            HStack {
                Button(Copy.buttonConnect) { if let u = URL(string: url) { onConnect(u) } }
                    .keyboardShortcut(.defaultAction)
                Button(Copy.buttonSkip, action: onSkip)
            }
        }
        .padding()
        .frame(width: 460)
    }
}
