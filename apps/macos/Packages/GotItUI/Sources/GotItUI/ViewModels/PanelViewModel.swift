import Foundation
import GotItModels
import GotItInfra

@MainActor
public final class PanelViewModel: ObservableObject {
    @Published public var events: [PanelEvent] = []
    @Published public var isWorking = false
    @Published public var pendingCaptureImage: Data? = nil
    public let chat: ChatViewModel

    private let api: APIClient
    private let capture: ScreenCaptureService
    private let writer: MarkdownFileWriter
    private let bookmark: SecureBookmarkStore
    private let monitor: OfflineMonitor
    @Published private var pendingScreenshot: URL?
    private var isProcessingScreenshot = false

    public init(api: APIClient,
                capture: ScreenCaptureService,
                writer: MarkdownFileWriter,
                bookmark: SecureBookmarkStore,
                monitor: OfflineMonitor,
                chat: ChatViewModel) {
        self.api = api; self.capture = capture; self.writer = writer
        self.bookmark = bookmark; self.monitor = monitor; self.chat = chat
    }

    public func lookAgain() async {
        isWorking = true
        defer { isWorking = false; pendingCaptureImage = nil }
        let png: Data
        do { png = try await capture.captureActiveDisplay() }
        catch ScreenCaptureError.permissionDenied {
            events.append(.permissionRequired(.screenRecording)); return
        } catch {
            events.append(.error(String(describing: error))); return
        }
        pendingCaptureImage = png
        await sendCapture(image: png, source: .refresh)
    }

    public func sendCapture(image: Data, source: CaptureSourceWire) async {
        await monitor.recheck()
        if await monitor.isOnline == false { events.append(.offlineChanged(false)); return }
        do {
            let r: CaptureResponse = try await api.send(.capture(image: image, source: source))
            chat.messages.append(.assistant(r.assistantMessage))
        } catch APIError.http(status: 409, _) {
            await chat.reset()
            do {
                let r: CaptureResponse = try await api.send(.capture(image: image, source: source))
                chat.messages.append(.assistant(r.assistantMessage))
            } catch APIError.unauthorized { events.append(.reconnectRequired) }
            catch { events.append(.error(String(describing: error))) }
        } catch APIError.unauthorized { events.append(.reconnectRequired) }
        catch { events.append(.error(String(describing: error))) }
    }

    public func handleScreenshot(at url: URL, graceSeconds: Double) async {
        guard !isProcessingScreenshot else { return }
        isProcessingScreenshot = true
        defer { isProcessingScreenshot = false }

        guard let data = try? Data(contentsOf: url) else { return }
        events.append(.toast("Screenshot captured — sending to GotIt!"))
        pendingScreenshot = url
        pendingCaptureImage = data
        if graceSeconds > 0 {
            try? await Task.sleep(nanoseconds: UInt64(graceSeconds * 1_000_000_000))
        }
        guard pendingScreenshot == url else { pendingCaptureImage = nil; return }
        pendingScreenshot = nil
        isWorking = true
        defer { isWorking = false; pendingCaptureImage = nil }
        await sendCapture(image: data, source: .screenshot)
    }

    public func cancelPendingScreenshot() async { pendingScreenshot = nil }

    public func dismissToast() {
        events.removeAll {
            if case .toast = $0 { return true }
            if case .savedTo = $0 { return true }
            return false
        }
    }

    public var isShowingPermissionPrompt: Bool {
        guard let last = events.last else { return false }
        if case .permissionRequired = last { return true }
        if case .reconnectRequired = last { return true }
        return false
    }

    public func clearScreenRecordingBanner() {
        events.removeAll { $0 == .permissionRequired(.screenRecording) }
    }

    public func didChooseVaultFolder(_ url: URL) {
        try? bookmark.save(folder: url)
    }

    public func save(instruction: String?) async {
        isWorking = true; defer { isWorking = false }

        await monitor.recheck()
        if await monitor.isOnline == false { events.append(.offlineChanged(false)); return }

        guard let resolved = bookmark.tryResolve() else {
            events.append(.permissionRequired(.vaultFolder)); return
        }
        defer { resolved.stopAccess() }

        let draft: SaveDraftResponse
        do {
            draft = try await api.send(.save(instruction: instruction))
        } catch APIError.unauthorized { events.append(.reconnectRequired); return }
        catch { events.append(.error(String(describing: error))); return }

        do {
            let final = try await writer.write(folder: resolved.url, relativePath: draft.vaultRelativePath, markdown: draft.markdown)
            events.append(.savedTo(final))
        } catch {
            events.append(.error("save failed: \(error)"))
        }
    }
}
