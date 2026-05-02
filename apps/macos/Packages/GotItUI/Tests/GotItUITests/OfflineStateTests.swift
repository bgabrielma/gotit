import Testing
import Foundation
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
}
