import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct OfflineStateTests {
    @Test func writeBlockedWhenOffline() async {
        let monitor = OfflineMonitorFactory.makeNull(initial: false)
        let api = APIClientFactory.makeNull()
        let vm = makeVM(api: api, monitor: monitor)
        await vm.sendCapture(image: Data([0x00]), source: .invoke)
        #expect(vm.events.contains(.offlineChanged(false)))
    }

    @Test func recheckCalledBeforeSendCapture() async {
        let monitor = OfflineMonitorFactory.makeNull(initial: false)
        // recheck transitions online → if called, sendCapture proceeds without blocking
        await monitor.script(results: [true])
        let api = APIClientFactory.makeNull(responses: [
            .capture: CaptureResponse(
                messageID: "m1",
                imageRef: "img1.png",
                analysis: .init(rawText: "", urls: [], regions: [], contextKind: .unknown, summary: ""),
                assistantMessage: .init(id: "a1", sessionID: "s1", text: "ok", createdAt: "now")
            )
        ])
        let vm = makeVM(api: api, monitor: monitor)
        await vm.sendCapture(image: Data([0x89, 0x50, 0x4E, 0x47]), source: .invoke)
        #expect(!vm.events.contains(.offlineChanged(false)),
                "recheck must be called so monitor transitions online before the isOnline guard")
    }

    @Test func recheckCalledBeforeSave() async throws {
        // Start online but script recheck to return false.
        // After Amendment E, save() calls recheck() first → transitions offline → blocked.
        let monitor = OfflineMonitorFactory.makeNull(initial: true)
        await monitor.script(results: [false])
        let dir = try makeTempDir()
        let api = APIClientFactory.makeNull(responses: [
            .save: SaveDraftResponse(vaultRelativePath: "GotIt!/test.md", markdown: "# test", saveRecordID: "r1")
        ])
        let bookmark = SecureBookmarkStoreFactory.makeNull(dir)
        let vm = makeVM(api: api, bookmark: bookmark, monitor: monitor)
        await vm.save(instruction: nil)
        #expect(vm.events.contains(.offlineChanged(false)),
                "recheck must be called before save; when it returns false, save must be blocked")
    }
}
