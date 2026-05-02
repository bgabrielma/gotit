import Foundation
import GotItInfra
import GotItUI

@MainActor
public final class AppDependencies: ObservableObject {
    public let config: AppConfig
    public let api: APIClient
    public let monitor: OfflineMonitor
    public let capture: ScreenCaptureService
    public let writer: MarkdownFileWriter
    public let bookmark: SecureBookmarkStore
    public let watcher: ScreenshotWatcher
    public let hotkeys: HotkeyRegistrar
    public let capabilities: DeviceCapabilities
    public let settings: SettingsViewModel
    public let panel: PanelViewModel

    public init(config: AppConfig) {
        self.config = config
        let keychain = KeychainStoreFactory.makeLive(service: config.keychainService, account: config.keychainAccount)
        let bookmark = SecureBookmarkStoreFactory.makeLive()
        self.bookmark = bookmark
        self.api = APIClientFactory.makeLive(baseURL: config.backendURL, keychain: keychain, installID: config.installID)
        self.monitor = OfflineMonitorFactory.makeLive(baseURL: config.backendURL, timeoutMs: config.healthProbeTimeoutMs)
        self.capture = ScreenCaptureServiceFactory.makeLive()
        self.writer = MarkdownFileWriterFactory.makeLive()
        self.watcher = ScreenshotWatcherFactory.makeLive()
        self.hotkeys = HotkeyRegistrarFactory.makeLive()
        self.capabilities = DeviceCapabilities(probe: LiveCapabilityProbe(bookmarkStore: bookmark))
        self.settings = SettingsViewModel(
            defaults: .standard,
            defaultBackendURL: config.backendURL,
            bookmarkStore: bookmark
        )
        let chat = ChatViewModel(api: api, monitor: monitor)
        self.panel = PanelViewModel(
            api: api, capture: capture, writer: writer, bookmark: bookmark, monitor: monitor, chat: chat
        )
    }
}
