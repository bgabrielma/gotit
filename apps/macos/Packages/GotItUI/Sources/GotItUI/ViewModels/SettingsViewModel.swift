import Foundation
import GotItInfra

@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public var backendURL: URL
    @Published public private(set) var vaultFolder: URL?

    private let defaults: UserDefaults
    private let bookmarkStore: SecureBookmarkStore

    public init(defaults: UserDefaults,
                defaultBackendURL: URL,
                bookmarkStore: SecureBookmarkStore = SecureBookmarkStoreFactory.makeNull()) {
        self.defaults = defaults
        self.bookmarkStore = bookmarkStore
        if let s = defaults.string(forKey: "GotItBackendURL"), let u = URL(string: s) {
            self.backendURL = u
        } else {
            self.backendURL = defaultBackendURL
        }
        self.vaultFolder = bookmarkStore.tryResolve()?.url
    }

    public func setBackendURL(_ url: URL) {
        backendURL = url
        defaults.set(url.absoluteString, forKey: "GotItBackendURL")
    }

    public func chooseVaultFolder(_ url: URL) throws {
        try bookmarkStore.save(folder: url)
        vaultFolder = url
    }
}
