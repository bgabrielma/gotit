import AppKit
import SwiftUI
import Combine
import GotItModels
import GotItInfra
import GotItUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let deps: AppDependencies = AppDependencies(config: AppConfig.load())
    private var statusItem: NSStatusItem?
    private var panelWindow: FloatingPanel?
    private var messageSub: AnyCancellable?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installStatusItem()
        Task { await determineFirstRun() }

        if deps.config.autoDetectScreenshots {
            deps.keypressDetector.start()
            Task {
                await deps.watcher.start()
                await consumeScreenshots()
            }
            Task { await consumeKeypresses() }
        }

        Task { await deps.hotkeys.registerOpenPanel { [weak self] in
            Task { @MainActor [weak self] in self?.togglePanel() }
        }}

        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { await self?.deps.capabilities.reprobe() }
            self?.deps.panel.clearScreenRecordingBanner()
        }

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

    private func determineFirstRun() async {
        let hasToken = (try? await deps.keychain.read()) != nil
        if hasToken {
            installPanel()
        } else {
            installFirstRun()
        }
    }

    private func installFirstRun() {
        let step = FirstRunBackendStep(defaultURL: deps.config.backendURL) { [weak self] _ in
            guard let self else { return }
            Task {
                do {
                    let resp: DeviceRegistrationResponse = try await self.deps.api.send(
                        .device(installID: self.deps.config.installID)
                    )
                    try await self.deps.keychain.write(resp.token)
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
        let host = PanelHostingView(
            panel: deps.panel,
            imageBaseURL: deps.imageBaseURL,
            keychain: deps.keychain
        )
        panelWindow = FloatingPanel(rootView: host)
        Task { await deps.panel.chat.start() }
        messageSub = deps.panel.chat.$messages
            .dropFirst()
            .receive(on: RunLoop.main)
            .sink { [weak self] messages in
                guard self?.panelWindow?.isVisible == false else { return }
                if case .assistant = messages.last { self?.panelWindow?.toggle() }
            }
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

    private func consumeKeypresses() async {
        for await _ in deps.keypressDetector.keypresses() {
            if panelWindow?.isVisible == false { panelWindow?.toggle() }
            deps.panel.isAwaitingScreenshot = true
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(15))
                self?.deps.panel.isAwaitingScreenshot = false
            }
        }
    }
}
