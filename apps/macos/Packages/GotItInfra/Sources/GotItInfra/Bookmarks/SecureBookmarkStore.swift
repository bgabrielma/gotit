import Foundation

public struct ResolvedBookmark: Sendable {
    public let url: URL
    public let stopAccess: @Sendable () -> Void
}

public protocol SecureBookmarkStore: Sendable {
    func save(folder: URL) throws
    func resolve() throws -> ResolvedBookmark
    func tryResolve() -> ResolvedBookmark?
    func clear()
}

public enum SecureBookmarkStoreFactory {
    public static func makeLive(defaults: UserDefaults = .standard, key: String = "GotItVaultBookmark") -> SecureBookmarkStore {
        UserDefaultsBookmarkStore(defaults: defaults, key: key)
    }
    public static func makeNull(_ folder: URL? = nil) -> SecureBookmarkStore {
        NullBookmarkStore(folder: folder)
    }
}

internal final class UserDefaultsBookmarkStore: SecureBookmarkStore, @unchecked Sendable {
    let defaults: UserDefaults
    let key: String
    init(defaults: UserDefaults, key: String) { self.defaults = defaults; self.key = key }

    func save(folder: URL) throws {
        let data = try folder.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(data, forKey: key)
    }

    func resolve() throws -> ResolvedBookmark {
        guard let data = defaults.data(forKey: key) else { throw APIError.transport("no vault bookmark stored") }
        var stale = false
        let url = try URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale { try? save(folder: url) }
        let started = url.startAccessingSecurityScopedResource()
        return ResolvedBookmark(url: url, stopAccess: {
            if started { url.stopAccessingSecurityScopedResource() }
        })
    }

    func tryResolve() -> ResolvedBookmark? { try? resolve() }
    func clear() { defaults.removeObject(forKey: key) }
}

internal final class NullBookmarkStore: SecureBookmarkStore, @unchecked Sendable {
    private var folder: URL?
    init(folder: URL?) { self.folder = folder }
    func save(folder: URL) throws { self.folder = folder }
    func resolve() throws -> ResolvedBookmark {
        guard let f = folder else { throw APIError.transport("no folder") }
        return ResolvedBookmark(url: f, stopAccess: {})
    }
    func tryResolve() -> ResolvedBookmark? { folder.map { ResolvedBookmark(url: $0, stopAccess: {}) } }
    func clear() { folder = nil }
}
