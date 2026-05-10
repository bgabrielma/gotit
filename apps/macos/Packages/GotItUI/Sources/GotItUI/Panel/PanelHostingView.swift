import SwiftUI
import GotItInfra

public struct PanelHostingView: View {
    @ObservedObject var panel: PanelViewModel
    private let imageBaseURL: URL?
    private let keychain: KeychainStore?

    public init(panel: PanelViewModel, imageBaseURL: URL? = nil, keychain: KeychainStore? = nil) {
        self.panel = panel
        self.imageBaseURL = imageBaseURL
        self.keychain = keychain
    }

    public var body: some View {
        ChatView(panel: panel, imageBaseURL: imageBaseURL, keychain: keychain)
    }
}
