import Foundation

public protocol KeychainStore: Sendable {
    func read() async throws -> String?
    func write(_ token: String) async throws
    func delete() async throws
}
