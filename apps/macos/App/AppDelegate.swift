import AppKit
import SwiftUI
import GotItModels
import GotItInfra
import GotItUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let deps: AppDependencies = AppDependencies(config: AppConfig.load())
    private var statusItem: NSStatusItem?
    private var panelWindow: FloatingPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installStatusItem()
        Task { await determineFirstRun() }
        if deps.config.autoDetectScreenshots {
            Task { await deps.watcher.start(); await consumeScreenshots() }
        }
        Task { await deps.hotkeys.registerOpenPanel { [weak self] in
            Task { @MainActor [weak self] in self?.togglePanel() }
        }}
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { await self?.deps.capabilities.reprobe() }
            self?.deps.panel.clearScreenRecordingBanner()
        }
        // Amendment D: reprobe on display configuration changes
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { await self?.deps.capabilities.reprobe() }
        }
    }

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "GotIt!"
        item.button?.target = self
        item.button?.action = #selector(togglePanel)
        statusItem = item
    }

    /// Amendment B: check Keychain for existing token; show first-run if absent.
    private func determineFirstRun() async {
        let keychain = KeychainStoreFactory.makeLive(service: deps.config.keychainService,
                                                     account: deps.config.keychainAccount)
        let hasToken = (try? await keychain.read()) != nil
        if hasToken {
            installPanel()
        } else {
            installFirstRun(keychain: keychain)
        }
    }

    private func installFirstRun(keychain: KeychainStore) {
        let step = FirstRunBackendStep(defaultURL: deps.config.backendURL) { [weak self] _ in
            guard let self else { return }
            Task {
                do {
                    let resp: DeviceRegistrationResponse = try await self.deps.api.send(
                        .device(installID: self.deps.config.installID)
                    )
                    try await keychain.write(resp.token)
                } catch {
                    // Error is surfaced by FirstRunBackendStep internally; user can retry
                }
                await MainActor.run { self.swapToMainPanel() }
            }
        } onSkip: { [weak self] in
            self?.swapToMainPanel()
        }
        panelWindow = FloatingPanel(rootView: step)
    }

    private func installPanel() {
        let host = PanelHostingView(panel: deps.panel)
        panelWindow = FloatingPanel(rootView: host)
        Task { await deps.panel.chat.start() }
    }

    private func swapToMainPanel() {
        panelWindow?.close()
        installPanel()
        panelWindow?.toggle()
    }

    @objc private func togglePanel() {
        panelWindow?.toggle()
    }

    private func consumeScreenshots() async {
        for await event in await deps.watcher.events() {
            if panelWindow?.isVisible == false { panelWindow?.toggle() }
            Task { await deps.panel.handleScreenshot(at: event.fileURL,
                                                     graceSeconds: Double(deps.config.screenshotGraceSeconds)) }
        }
    }
}
