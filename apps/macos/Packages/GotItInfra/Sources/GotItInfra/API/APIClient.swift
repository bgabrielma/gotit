import Foundation

public protocol APIClient: Sendable {
    func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R
}
