import Foundation

public struct NullResponses: Sendable {
    public var byEndpoint: [Endpoint.ID: any Decodable & Sendable]
    public var failures: [Endpoint.ID: APIError]
    public init(byEndpoint: [Endpoint.ID: any Decodable & Sendable] = [:], failures: [Endpoint.ID: APIError] = [:]) {
        self.byEndpoint = byEndpoint; self.failures = failures
    }
}

internal actor NullAPIClient: APIClient {
    private var script: NullResponses

    init(_ script: NullResponses) { self.script = script }

    func setScript(_ script: NullResponses) { self.script = script }

    nonisolated public func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R {
        try await answer(for: endpoint)
    }

    private func answer<R: Decodable & Sendable>(for endpoint: Endpoint) async throws -> R {
        if let err = script.failures[endpoint.id] { throw err }
        guard let value = script.byEndpoint[endpoint.id] else {
            throw APIError.nullNotConfigured("no response configured for \(endpoint.id)")
        }
        guard let typed = value as? R else {
            throw APIError.decoding("null response wrong type for \(endpoint.id)")
        }
        return typed
    }
}
