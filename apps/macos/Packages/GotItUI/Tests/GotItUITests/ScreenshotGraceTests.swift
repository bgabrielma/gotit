import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct ScreenshotGraceTests {
    @Test func screenshotEventTriggersGraceWindowThenSends() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m1",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a1", sessionID: "s1", text: "ok", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api)
        let url = try writeTempPNG()
        await vm.handleScreenshot(at: url, graceSeconds: 0)
        #expect(vm.chat.messages.count == 1)
    }

    @Test func cancelDuringGraceSuppressesSend() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m2",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a2", sessionID: "s2", text: "ok", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api)
        let url = try writeTempPNG()
        let task = Task { await vm.handleScreenshot(at: url, graceSeconds: 1.0) }
        // Yield for 50ms so handleScreenshot starts and sets pendingScreenshot before we cancel.
        try await Task.sleep(nanoseconds: 50_000_000)
        await vm.cancelPendingScreenshot()
        await task.value
        #expect(vm.chat.messages.isEmpty)
    }
}
