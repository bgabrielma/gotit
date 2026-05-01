import Testing
import Foundation
@testable import GotItModels

@Suite struct AnalysisResultCodableTests {
    @Test func roundTrips() throws {
        let json = """
        {
          "raw_text": "some text",
          "urls": [{"href": "https://example.com", "anchor": "Example", "near_text": null}],
          "regions": [{"kind": "header", "text": "Title", "bbox": {"x": 0, "y": 0, "w": 100, "h": 20}}],
          "context_kind": "browser_article",
          "summary": "A page summary"
        }
        """.data(using: .utf8)!
        let r = try JSONDecoder().decode(AnalysisResult.self, from: json)
        #expect(r.rawText == "some text")
        #expect(r.urls.first?.href == "https://example.com")
        #expect(r.regions.first?.kind == .header)
        #expect(r.contextKind == .browser_article)
        let encoded = try JSONEncoder().encode(r)
        let back = try JSONDecoder().decode(AnalysisResult.self, from: encoded)
        #expect(back == r)
    }
}
