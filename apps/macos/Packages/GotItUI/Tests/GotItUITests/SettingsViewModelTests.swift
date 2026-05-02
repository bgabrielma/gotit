import Testing
import Foundation
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct SettingsViewModelTests {
    @Test func updatesBackendURLAndPersists() {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let vm = SettingsViewModel(defaults: defaults, defaultBackendURL: URL(string: "http://localhost:3000")!)
        #expect(vm.backendURL.absoluteString == "http://localhost:3000")
        vm.setBackendURL(URL(string: "https://api.example.com")!)
        #expect(defaults.string(forKey: "GotItBackendURL") == "https://api.example.com")
    }

    @Test func chooseVaultFolderInvokesBookmarkStore() throws {
        let tmp = try makeTempDir(); defer { try? FileManager.default.removeItem(at: tmp) }
        let store = SecureBookmarkStoreFactory.makeNull()
        let vm = SettingsViewModel(defaults: UserDefaults(suiteName: "t-\(UUID())")!,
                                   defaultBackendURL: URL(string: "http://localhost:3000")!,
                                   bookmarkStore: store)
        try vm.chooseVaultFolder(tmp)
        #expect(vm.vaultFolder == tmp)
    }
}

private func makeTempDir() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
