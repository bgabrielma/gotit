import Testing
import Foundation
@testable import GotItInfra

@Suite struct MarkdownFileWriterLiveTests {
    @Test func writesAtomically() async throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let writer = MarkdownFileWriterFactory.makeLive()
        let final = try await writer.write(folder: tmp, relativePath: "GotIt!/2026-05-01-foo.md", markdown: "# hello")
        let content = try String(contentsOf: final, encoding: .utf8)
        #expect(content == "# hello")
        #expect(final.path.hasSuffix("GotIt!/2026-05-01-foo.md"))
    }
    @Test func resolvesCollision() async throws {
        let tmp = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: tmp) }
        let writer = MarkdownFileWriterFactory.makeLive()
        _ = try await writer.write(folder: tmp, relativePath: "GotIt!/x.md", markdown: "first")
        let second = try await writer.write(folder: tmp, relativePath: "GotIt!/x.md", markdown: "second")
        #expect(second.lastPathComponent == "x-1.md")
    }
}

private func makeTempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gotit-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}
