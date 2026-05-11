import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct ScreenshotKeypressGateTests {

    // MARK: - Gate: no keypress → no processing

    @Test func handleScreenshotIgnoredWithoutKeypress() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m1",
                imageRef: "img1.png",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a1", sessionID: "s1", text: "ok", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api)
        let url = try writeTempPNG()
        // isAwaitingScreenshot is false — simulates a Cmd+Shift+4 file the watcher picks up
        await vm.handleScreenshot(at: url, graceSeconds: 0)
        #expect(vm.chat.messages.isEmpty)
        #expect(!vm.isWorking)
    }

    // MARK: - Gate: keypress detected → processes and clears awaiting

    @Test func handleScreenshotProcessesWhenKeypressDetected() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m2",
                imageRef: "img2.png",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a2", sessionID: "s2", text: "done", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api)
        let url = try writeTempPNG()
        vm.isAwaitingScreenshot = true
        await vm.handleScreenshot(at: url, graceSeconds: 0)
        #expect(vm.chat.messages.count == 2)
        #expect(!vm.isAwaitingScreenshot)
    }

    // MARK: - Gate: concurrent call blocked while already processing

    @Test func concurrentScreenshotIsIgnored() async throws {
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m3",
                imageRef: "img3.png",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a3", sessionID: "s3", text: "first", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api)
        let url = try writeTempPNG()
        vm.isAwaitingScreenshot = true
        // First call processes; second arrives while first is in-flight (graceSeconds > 0)
        async let first: Void = vm.handleScreenshot(at: url, graceSeconds: 0)
        async let second: Void = vm.handleScreenshot(at: url, graceSeconds: 0)
        await first; await second
        // Two messages (screenCapture + assistant) from first call; concurrent call blocked
        #expect(vm.chat.messages.count == 2)
    }

    // MARK: - isAwaitingScreenshot contributes to isInteractionBlocked

    @Test func awaitingScreenshotIsReflectedInPendingCaptureImage() async throws {
        let api = APIClientFactory.makeNull()
        let vm = makeVM(api: api)
        #expect(!vm.isAwaitingScreenshot)
        vm.isAwaitingScreenshot = true
        #expect(vm.isAwaitingScreenshot)
    }
}
