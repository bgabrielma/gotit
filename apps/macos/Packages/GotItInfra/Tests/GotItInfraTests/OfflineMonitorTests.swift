import Testing
@testable import GotItInfra

@Suite struct OfflineMonitorTests {
    @Test func nullStartsOnlineByDefault() async {
        let m = OfflineMonitorFactory.makeNull()
        #expect(await m.isOnline == true)
    }

    @Test func recheckRespectsScript() async {
        let m = OfflineMonitorFactory.makeNull(initial: true)
        await m.script(results: [false, true])
        _ = await m.recheck()
        #expect(await m.isOnline == false)
        _ = await m.recheck()
        #expect(await m.isOnline == true)
    }
}
