import Foundation

public enum ChatSource: String, Codable, Sendable { case text, mic, listen }

public struct ChatRequest: Codable, Equatable, Sendable {
    public let text: String
    public let source: ChatSource
    public init(text: String, source: ChatSource) { self.text = text; self.source = source }
}

public struct SaveRequest: Codable, Equatable, Sendable {
    public let instruction: String?
    public init(instruction: String? = nil) { self.instruction = instruction }
}
