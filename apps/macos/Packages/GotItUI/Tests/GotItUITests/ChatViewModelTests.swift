import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct ChatViewModelTests {
    @Test func sendsTextAndAppendsAssistant() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .chat: ChatResponse(
                messageID: "u1",
                assistantMessage: AssistantPayload(id: "a1", sessionID: "s1", text: "hi back", createdAt: "now")
            ),
        ])
        let vm = ChatViewModel(api: api, monitor: OfflineMonitorFactory.makeNull())
        await vm.send(text: "hi")
        #expect(vm.messages.count == 2)
        guard case .userText(let u) = vm.messages[0], case .assistant(let a) = vm.messages[1] else {
            Issue.record("wrong shape"); return
        }
        #expect(u.text == "hi")
        #expect(a.text == "hi back")
    }

    @Test func surfacesUnauthorizedAsReconnectRequired() async {
        let api = APIClientFactory.makeNull(failures: [.chat: .unauthorized])
        let vm = ChatViewModel(api: api, monitor: OfflineMonitorFactory.makeNull())
        await vm.send(text: "hi")
        #expect(vm.lastEvent == .reconnectRequired)
    }
}
