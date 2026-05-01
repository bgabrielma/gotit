import Foundation

public enum KeychainStoreFactory {
    public static func makeLive(service: String, account: String) -> KeychainStore {
        SecKeychainStore(service: service, account: account)
    }
    public static func makeNull(initial: String? = nil) -> KeychainStore {
        NullKeychainStore(initial: initial)
    }
}
