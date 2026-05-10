import Foundation
import GotItModels
import GotItInfra

@MainActor
public final class ChatViewModel: ObservableObject {
    @Published public var messages: [Message] = []
    @Published public var lastEvent: PanelEvent?
    @Published public var isSending = false
    @Published public var pendingUserText: String? = nil

    private let api: APIClient
    private let monitor: OfflineMonitor

    public init(api: APIClient, monitor: OfflineMonitor) {
        self.api = api; self.monitor = monitor
    }

    public func send(text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSending = true
        pendingUserText = trimmed
        defer { isSending = false; pendingUserText = nil }

        if await monitor.isOnline == false { lastEvent = .offlineChanged(false); return }
        do {
            let resp: ChatResponse = try await api.send(.chat(text: trimmed, source: .text))
            let now = ISO8601DateFormatter().string(from: Date())
            messages.append(.userText(.init(id: resp.messageID, sessionID: resp.assistantMessage.sessionID, text: trimmed, source: .text, createdAt: now)))
            messages.append(.assistant(resp.assistantMessage))
        } catch APIError.http(status: 409, _) {
            await reset()
            do {
                let resp: ChatResponse = try await api.send(.chat(text: trimmed, source: .text))
                let now = ISO8601DateFormatter().string(from: Date())
                messages.append(.userText(.init(id: resp.messageID, sessionID: resp.assistantMessage.sessionID, text: trimmed, source: .text, createdAt: now)))
                messages.append(.assistant(resp.assistantMessage))
            } catch APIError.unauthorized { lastEvent = .reconnectRequired }
            catch { lastEvent = .error(String(describing: error)) }
        } catch APIError.unauthorized {
            lastEvent = .reconnectRequired
        } catch APIError.offline {
            lastEvent = .offlineChanged(false)
        } catch {
            lastEvent = .error(String(describing: error))
        }
    }

    /// Load existing session or create a fresh one if none exists.
    public func start() async {
        do {
            let r: ActiveSessionResponse = try await api.send(.sessionsActive)
            messages = r.messagesTail
        } catch {
            await reset()
        }
    }

    public func loadActive() async {
        do {
            let r: ActiveSessionResponse = try await api.send(.sessionsActive)
            messages = r.messagesTail
        } catch { /* tolerated — empty state */ }
    }

    public func reset() async {
        do {
            _ = try await api.send(.sessionsCreate) as CreateSessionResponse
            messages = []
        } catch APIError.unauthorized { lastEvent = .reconnectRequired }
        catch { lastEvent = .error(String(describing: error)) }
    }
}
