import Foundation

internal actor NullKeychainStore: KeychainStore {
    private var token: String?
    init(initial: String?) { self.token = initial }
    func read() async throws -> String? { token }
    func write(_ token: String) async throws { self.token = token }
    func delete() async throws { token = nil }
}
