import Foundation

public protocol MarkdownFileWriter: Sendable {
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL
}

public enum MarkdownFileWriterFactory {
    public static func makeLive() -> MarkdownFileWriter { FileManagerMarkdownWriter() }
    public static func makeNull(failsWith error: Error? = nil) -> MarkdownFileWriter {
        NullMarkdownFileWriter(error: error)
    }
}

internal struct FileManagerMarkdownWriter: MarkdownFileWriter {
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL {
        let target = folder.appendingPathComponent(relativePath)
        let parent = target.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        let siblings = (try? FileManager.default.contentsOfDirectory(atPath: parent.path)) ?? []
        let resolved = resolveCollision(existing: siblings, candidate: target.lastPathComponent)
        let final = parent.appendingPathComponent(resolved)
        try Data(markdown.utf8).write(to: final, options: [.atomic])
        return final
    }
}

internal struct NullMarkdownFileWriter: MarkdownFileWriter {
    let error: Error?
    func write(folder: URL, relativePath: String, markdown: String) async throws -> URL {
        if let error { throw error }
        return folder.appendingPathComponent(relativePath)
    }
}
