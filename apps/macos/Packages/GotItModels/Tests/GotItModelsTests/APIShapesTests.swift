import Testing
import Foundation
@testable import GotItModels

@Suite struct APIShapesTests {
    @Test func decodesSaveDraftResponse() throws {
        let jsonStr = "{\"vault_relative_path\":\"GotIt!/2026-05-01-foo.md\",\"markdown\":\"# Title\",\"save_record_id\":\"sr_1\"}"
        let json = jsonStr.data(using: .utf8)!
        let r = try JSONDecoder().decode(SaveDraftResponse.self, from: json)
        #expect(r.vaultRelativePath == "GotIt!/2026-05-01-foo.md")
        #expect(r.markdown == "# Title")
        #expect(r.saveRecordID == "sr_1")
    }

    @Test func decodesHealthResponse() throws {
        let jsonStr = "{\"ok\":true,\"version\":\"1.0.0\"}"
        let json = jsonStr.data(using: .utf8)!
        let r = try JSONDecoder().decode(HealthResponse.self, from: json)
        #expect(r.ok == true)
        #expect(r.version == "1.0.0")
    }

    @Test func decodesCreateSessionResponse() throws {
        let jsonStr = "{\"session_id\":\"sess_1\",\"started_at\":\"2026-05-01T12:00:00.000Z\"}"
        let json = jsonStr.data(using: .utf8)!
        let r = try JSONDecoder().decode(CreateSessionResponse.self, from: json)
        #expect(r.sessionID == "sess_1")
    }

    @Test func decodesDeviceRegistrationResponse() throws {
        let jsonStr = "{\"device_id\":\"dev_1\",\"token\":\"tok_abc\"}"
        let json = jsonStr.data(using: .utf8)!
        let r = try JSONDecoder().decode(DeviceRegistrationResponse.self, from: json)
        #expect(r.deviceID == "dev_1")
        #expect(r.token == "tok_abc")
    }
}
