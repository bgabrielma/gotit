import Testing
@testable import GotItInfra

@Suite struct DeviceCapabilitiesTests {
    @Test func reflectsScriptedPermissions() async {
        let probe = ScriptedCapabilityProbe()
        await probe.set(screenRecording: false, vaultFolder: false)
        let caps = DeviceCapabilities(probe: probe)
        await caps.reprobe()
        let snapshot = await caps.snapshot
        #expect(snapshot.screenRecording == false)
        #expect(snapshot.vaultFolder == false)
        await probe.set(screenRecording: true, vaultFolder: true)
        await caps.reprobe()
        let after = await caps.snapshot
        #expect(after.screenRecording)
        #expect(after.vaultFolder)
    }
}
