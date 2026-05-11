import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct PanelViewModelTests {
    @Test func lookAgainSendsCaptureAndAppendsResults() async throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        let capture = ScreenCaptureServiceFactory.makeNull(returning: png)
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m1",
                imageRef: "img1.png",
                analysis: AnalysisResult(rawText: "hi", urls: [], regions: [], contextKind: .browser_article, summary: "hello world"),
                assistantMessage: AssistantPayload(id: "a1", sessionID: "s1", text: "looking", createdAt: "now")
            ),
        ])
        let vm = makeVM(api: api, capture: capture)
        await vm.lookAgain()
        #expect(vm.chat.messages.count == 2)
        guard case .screenCapture(let sc) = vm.chat.messages.first else { Issue.record("no screenCapture"); return }
        #expect(sc.imageRef == "img1.png")
        guard case .assistant(let a) = vm.chat.messages.last else { Issue.record("no assistant"); return }
        #expect(a.text == "looking")
    }

    @Test func lookAgainSurfacesPermissionDenied() async {
        let capture = ScreenCaptureServiceFactory.makeNull(failsWith: .permissionDenied)
        let api = APIClientFactory.makeNull()
        let vm = makeVM(api: api, capture: capture)
        await vm.lookAgain()
        #expect(vm.events.last == .permissionRequired(.screenRecording))
    }
}
