import Foundation
import GotItInfra

public struct AppConfig: Sendable {
    public let backendURL: URL
    public let healthProbeTimeoutMs: Int
    public let installID: String
    public let keychainService: String
    public let keychainAccount: String
    public let autoDetectScreenshots: Bool
    public let screenshotGraceSeconds: Int

    public static func load(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> AppConfig {
        let infoURL = (bundle.object(forInfoDictionaryKey: "GotItBackendURL") as? String).flatMap(URL.init(string:))
        let overrideURL = (defaults.string(forKey: "GotItBackendURL")).flatMap(URL.init(string:))
        let backend = overrideURL ?? infoURL ?? URL(string: "http://localhost:3000")!
        let timeout = (bundle.object(forInfoDictionaryKey: "GotItHealthProbeTimeoutMs") as? Int) ?? 1500
        let autoDetect = (bundle.object(forInfoDictionaryKey: "GotItAutoDetectScreenshots") as? Bool) ?? true
        let graceSeconds = (bundle.object(forInfoDictionaryKey: "GotItScreenshotGraceSeconds") as? Int) ?? 3

        let installStore = InstallIDStoreFactory.makeLive(defaults: defaults, key: "GotItInstallID")
        return AppConfig(
            backendURL: backend,
            healthProbeTimeoutMs: timeout,
            installID: installStore.get(),
            keychainService: "dev.gotit.macos",
            keychainAccount: "device_token",
            autoDetectScreenshots: autoDetect,
            screenshotGraceSeconds: graceSeconds
        )
    }
}
