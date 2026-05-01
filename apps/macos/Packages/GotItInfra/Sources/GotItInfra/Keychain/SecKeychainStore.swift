import Foundation
import Security

internal actor SecKeychainStore: KeychainStore {
    private let service: String
    private let account: String
    init(service: String, account: String) { self.service = service; self.account = account }

    func read() async throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let s = String(data: data, encoding: .utf8) else {
            throw APIError.transport("keychain read failed: \(status)")
        }
        return s
    }

    func write(_ token: String) async throws {
        let data = Data(token.utf8)
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(attrs as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = attrs; add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let s2 = SecItemAdd(add as CFDictionary, nil)
            guard s2 == errSecSuccess else { throw APIError.transport("keychain add failed: \(s2)") }
            return
        }
        guard status == errSecSuccess else { throw APIError.transport("keychain update failed: \(status)") }
    }

    func delete() async throws {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(q as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw APIError.transport("keychain delete failed: \(status)")
        }
    }
}
