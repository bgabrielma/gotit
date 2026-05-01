import Testing
import Foundation
@testable import GotItModels

@Suite struct MessageCodableTests {
    @Test func decodesScreenCapture() throws {
        let json = """
        {
          "id": "m1",
          "session_id": "s1",
          "kind": "screen_capture",
          "image_ref": "abc.png",
          "analysis": {
            "raw_text": "hello",
            "urls": [{"href": "https://example.com"}],
            "regions": [],
            "context_kind": "browser_article",
            "summary": "hi"
          },
          "source": "screenshot",
          "created_at": "2026-05-01T12:00:00.000Z"
        }
        """.data(using: .utf8)!
        let m = try JSONDecoder().decode(Message.self, from: json)
        guard case let .screenCapture(payload) = m else { Issue.record("wrong kind"); return }
        #expect(payload.id == "m1")
        #expect(payload.analysis.urls.first?.href == "https://example.com")
    }

    @Test func roundTripsAllKinds() throws {
        let now = "2026-05-01T12:00:00.000Z"
        let cases: [Message] = [
            .userText(.init(id: "1", sessionID: "s", text: "hi", source: .text, createdAt: now)),
            .assistant(.init(id: "2", sessionID: "s", text: "hello", createdAt: now)),
            .saveRecord(.init(id: "3", sessionID: "s", vaultPath: "GotIt!/x.md", instruction: nil, createdAt: now)),
        ]
        for c in cases {
            let data = try JSONEncoder().encode(c)
            let back = try JSONDecoder().decode(Message.self, from: data)
            #expect(back == c)
        }
    }
}
