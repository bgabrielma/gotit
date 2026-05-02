import Foundation
import GotItModels
import GotItInfra

@MainActor
public final class PanelViewModel: ObservableObject {
    @Published public var events: [PanelEvent] = []
    @Published public var isWorking = false
    public let chat: ChatViewModel

    private let api: APIClient
    private let capture: ScreenCaptureService
    private let writer: MarkdownFileWriter
    private let bookmark: SecureBookmarkStore
    private let monitor: OfflineMonitor

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
        isWorking = true; defer { isWorking = false }
        let png: Data
        do { png = try await capture.captureActiveDisplay() }
        catch ScreenCaptureError.permissionDenied {
            events.append(.permissionRequired(.screenRecording)); return
        } catch {
            events.append(.error(String(describing: error))); return
        }
        await sendCapture(image: png, source: .refresh)
    }

    public func sendCapture(image: Data, source: CaptureSourceWire) async {
        if await monitor.isOnline == false { events.append(.offlineChanged(false)); return }
        do {
            let r: CaptureResponse = try await api.send(.capture(image: image, source: source))
            chat.messages.append(.assistant(r.assistantMessage))
        } catch APIError.unauthorized { events.append(.reconnectRequired) }
        catch { events.append(.error(String(describing: error))) }
    }

    public func save(instruction: String?) async {
        isWorking = true; defer { isWorking = false }

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
