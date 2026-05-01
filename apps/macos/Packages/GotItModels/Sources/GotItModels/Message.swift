import Foundation

public enum Source: String, Codable, Equatable, Sendable { case text, mic, listen }
public enum CaptureSource: String, Codable, Equatable, Sendable { case screenshot, keybind, refresh, invoke }

public struct ScreenCapturePayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let imageRef: String
    public let analysis: AnalysisResult
    public let source: CaptureSource
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, sessionID = "session_id", imageRef = "image_ref", analysis, source, createdAt = "created_at"
    }

    public init(id: String, sessionID: String, imageRef: String, analysis: AnalysisResult, source: CaptureSource, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.imageRef = imageRef
        self.analysis = analysis; self.source = source; self.createdAt = createdAt
    }
}

public struct UserTextPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let text: String
    public let source: Source
    public let createdAt: String

    enum CodingKeys: String, CodingKey { case id, sessionID = "session_id", text, source, createdAt = "created_at" }

    public init(id: String, sessionID: String, text: String, source: Source, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.text = text; self.source = source; self.createdAt = createdAt
    }
}

public struct AssistantPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let text: String
    public let createdAt: String

    enum CodingKeys: String, CodingKey { case id, sessionID = "session_id", text, createdAt = "created_at" }

    public init(id: String, sessionID: String, text: String, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.text = text; self.createdAt = createdAt
    }
}

public struct SaveRecordPayload: Codable, Equatable, Sendable {
    public let id: String
    public let sessionID: String
    public let vaultPath: String
    public let instruction: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, sessionID = "session_id", vaultPath = "vault_path", instruction, createdAt = "created_at"
    }

    public init(id: String, sessionID: String, vaultPath: String, instruction: String?, createdAt: String) {
        self.id = id; self.sessionID = sessionID; self.vaultPath = vaultPath
        self.instruction = instruction; self.createdAt = createdAt
    }
}

public enum Message: Codable, Equatable, Sendable {
    case screenCapture(ScreenCapturePayload)
    case userText(UserTextPayload)
    case assistant(AssistantPayload)
    case saveRecord(SaveRecordPayload)

    private enum DiscriminatorKey: String, CodingKey { case kind }
    private enum Kind: String, Codable {
        case screen_capture, user_text, assistant, save_record
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DiscriminatorKey.self)
        let kind = try c.decode(Kind.self, forKey: .kind)
        let single = try decoder.singleValueContainer()
        switch kind {
        case .screen_capture: self = .screenCapture(try single.decode(ScreenCapturePayload.self))
        case .user_text:      self = .userText(try single.decode(UserTextPayload.self))
        case .assistant:      self = .assistant(try single.decode(AssistantPayload.self))
        case .save_record:    self = .saveRecord(try single.decode(SaveRecordPayload.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DiscriminatorKey.self)
        switch self {
        case .screenCapture(let p):
            try c.encode(Kind.screen_capture, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .userText(let p):
            try c.encode(Kind.user_text, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .assistant(let p):
            try c.encode(Kind.assistant, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        case .saveRecord(let p):
            try c.encode(Kind.save_record, forKey: .kind)
            var s = encoder.singleValueContainer(); try s.encode(p)
        }
    }
}
