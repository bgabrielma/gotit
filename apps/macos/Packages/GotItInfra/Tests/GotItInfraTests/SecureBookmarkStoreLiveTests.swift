import Testing
import Foundation
@testable import GotItInfra

@Suite struct SecureBookmarkStoreLiveTests {
    @Test func storesAndResolvesBookmark() throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let store = SecureBookmarkStoreFactory.makeLive(defaults: defaults, key: "vault")
        try store.save(folder: tmp)
        let resolved = try store.resolve()
        #expect(resolved.url.standardizedFileURL == tmp.standardizedFileURL)
        resolved.stopAccess()
    }

    @Test func returnsNilWhenUnset() throws {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let store = SecureBookmarkStoreFactory.makeLive(defaults: defaults, key: "vault")
        #expect(store.tryResolve() == nil)
    }
}

private func makeTempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gotit-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}
