import Testing
import Foundation
import GotItModels
import GotItInfra
@testable import GotItUI

@Suite @MainActor struct SaveFlowTests {
    @Test func savesMarkdownToVaultAndReportsDelivery() async throws {
        let tmp = try makeTempDir(); defer { try? FileManager.default.removeItem(at: tmp) }
        let bookmark = SecureBookmarkStoreFactory.makeNull(tmp)
        let writer = MarkdownFileWriterFactory.makeLive()
        let api = APIClientFactory.makeNull(responses: [
            .save: SaveDraftResponse(vaultRelativePath: "GotIt!/x.md", markdown: "# hi", saveRecordID: "sr1"),
        ])
        let vm = makeVM(api: api, writer: writer, bookmark: bookmark)
        await vm.save(instruction: nil)
        guard case .savedTo(let url) = vm.events.last else { Issue.record("no savedTo event"); return }
        #expect((try? String(contentsOf: url, encoding: .utf8)) == "# hi")
    }
}
