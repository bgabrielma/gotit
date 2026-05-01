import Testing
import Foundation
@testable import GotItInfra

@Suite struct KeychainStoreLiveTests {
    @Test func writeReadDeleteRoundTrip() async throws {
        let service = "dev.gotit.test.\(UUID().uuidString)"
        let store = KeychainStoreFactory.makeLive(service: service, account: "device_token")
        try await store.delete()
        #expect(try await store.read() == nil)
        try await store.write("abc")
        #expect(try await store.read() == "abc")
        try await store.write("def")
        #expect(try await store.read() == "def")
        try await store.delete()
        #expect(try await store.read() == nil)
    }
}
