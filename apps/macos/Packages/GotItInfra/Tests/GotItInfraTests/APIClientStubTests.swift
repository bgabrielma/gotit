import Testing
import Foundation
import GotItModels
@testable import GotItInfra

/// All tests that use StubProtocol share static state, so they must run serially.
@Suite(.serialized) struct APIClientStubTests {

    @Suite struct APIClient401Tests {
        @Test func repairs401AndRetries() async throws {
            let stub = StubProtocol.shared
            await stub.reset()
            await stub.script([
                .response(status: 401, body: Data("unauthorized".utf8)),
                .response(status: 201, body: try JSONEncoder().encode(
                    DeviceRegistrationResponse(deviceID: "d1", token: "t-new")
                )),
                .response(status: 200, body: try JSONEncoder().encode(
                    HealthResponse(ok: true, version: "x")
                )),
            ])
            let session = URLSession(configuration: StubProtocol.makeConfig())
            let keychain = KeychainStoreFactory.makeNull(initial: "t-old")
            let client = APIClientFactory.makeLive(
                baseURL: URL(string: "http://example.test")!,
                session: session,
                keychain: keychain,
                installID: "i-1"
            )
            let r: HealthResponse = try await client.send(.health)
            #expect(r.ok == true)
            let stored = try await keychain.read()
            #expect(stored == "t-new")
            let calls = await stub.recordedAuthHeaders()
            #expect(calls == ["Bearer t-old", nil, "Bearer t-new"])
        }

        @Test func surfacesUnauthorizedWhenRepairAlsoFails() async throws {
            let stub = StubProtocol.shared
            await stub.reset()
            await stub.script([
                .response(status: 401, body: Data()),
                .response(status: 401, body: Data()),
            ])
            let session = URLSession(configuration: StubProtocol.makeConfig())
            let keychain = KeychainStoreFactory.makeNull(initial: "t")
            let client = APIClientFactory.makeLive(
                baseURL: URL(string: "http://example.test")!,
                session: session,
                keychain: keychain,
                installID: "i-1"
            )
            await #expect(throws: APIError.unauthorized) {
                let _: HealthResponse = try await client.send(.health)
            }
        }
    }

    @Suite struct APIClientRetryTests {
        @Test func retriesOn5xxThenSucceeds() async throws {
            let stub = StubProtocol.shared
            await stub.reset()
            await stub.script([
                .response(status: 503, body: Data()),
                .response(status: 200, body: try JSONEncoder().encode(HealthResponse(ok: true, version: "v"))),
            ])
            let client = APIClientFactory.makeLive(
                baseURL: URL(string: "http://example.test")!,
                session: URLSession(configuration: StubProtocol.makeConfig()),
                keychain: KeychainStoreFactory.makeNull(initial: nil),
                installID: "i"
            )
            let r: HealthResponse = try await client.send(.health)
            #expect(r.version == "v")
        }

        @Test func surfacesOfflineOnTransport() async throws {
            let stub = StubProtocol.shared
            await stub.reset()
            await stub.script([.error(URLError(.notConnectedToInternet))])
            let client = APIClientFactory.makeLive(
                baseURL: URL(string: "http://example.test")!,
                session: URLSession(configuration: StubProtocol.makeConfig()),
                keychain: KeychainStoreFactory.makeNull(initial: nil),
                installID: "i"
            )
            await #expect(throws: APIError.self) {
                let _: HealthResponse = try await client.send(.health)
            }
        }
    }
}
