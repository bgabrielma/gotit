import Testing
import Foundation
import GotItModels
@testable import GotItInfra

@Suite struct APIClientNullTests {
    @Test func healthReturnsConfiguredResponse() async throws {
        let json = Data(#"{"ok":true,"version":"1.2.3"}"#.utf8)
        let canned = try JSONDecoder().decode(HealthResponse.self, from: json)
        let client = APIClientFactory.makeNull(
            responses: [.health: canned]
        )
        let r: HealthResponse = try await client.send(.health)
        #expect(r.version == "1.2.3")
    }

    @Test func unconfiguredEndpointThrowsNullNotConfigured() async {
        let client = APIClientFactory.makeNull()
        await #expect(throws: APIError.self) {
            let _: HealthResponse = try await client.send(.health)
        }
    }
}
