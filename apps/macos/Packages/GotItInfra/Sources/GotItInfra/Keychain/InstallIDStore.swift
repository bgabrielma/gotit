import Foundation

public protocol InstallIDStore: Sendable {
    func get() -> String
}

public enum InstallIDStoreFactory {
    public static func makeLive(defaults: UserDefaults = .standard, key: String = "GotItInstallID") -> InstallIDStore {
        UserDefaultsInstallIDStore(defaults: defaults, key: key)
    }
    public static func makeNull(_ id: String = "test-install") -> InstallIDStore {
        FixedInstallIDStore(id: id)
    }
}

internal struct UserDefaultsInstallIDStore: InstallIDStore {
    let defaults: UserDefaults
    let key: String
    func get() -> String {
        if let s = defaults.string(forKey: key) { return s }
        let id = UUID().uuidString
        defaults.set(id, forKey: key)
        return id
    }
}

internal struct FixedInstallIDStore: InstallIDStore {
    let id: String
    func get() -> String { id }
}
