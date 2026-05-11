import Foundation

public struct DeviceRegistrationResponse: Codable, Equatable, Sendable {
    public let deviceID: String
    public let token: String
    public init(deviceID: String, token: String) { self.deviceID = deviceID; self.token = token }
    enum CodingKeys: String, CodingKey { case deviceID = "device_id", token }
}

public struct CaptureResponse: Codable, Equatable, Sendable {
    public let messageID: String
    public let imageRef: String
    public let analysis: AnalysisResult
    public let assistantMessage: AssistantPayload
    public init(messageID: String, imageRef: String, analysis: AnalysisResult, assistantMessage: AssistantPayload) {
        self.messageID = messageID; self.imageRef = imageRef; self.analysis = analysis; self.assistantMessage = assistantMessage
    }
    enum CodingKeys: String, CodingKey {
        case messageID = "message_id", imageRef = "image_ref", analysis, assistantMessage = "assistant_message"
    }
}

public struct ChatResponse: Codable, Equatable, Sendable {
    public let messageID: String
    public let assistantMessage: AssistantPayload
    public init(messageID: String, assistantMessage: AssistantPayload) { self.messageID = messageID; self.assistantMessage = assistantMessage }
    enum CodingKeys: String, CodingKey { case messageID = "message_id", assistantMessage = "assistant_message" }
}

public struct SaveDraftResponse: Codable, Equatable, Sendable {
    public let vaultRelativePath: String
    public let markdown: String
    public let saveRecordID: String
    public init(vaultRelativePath: String, markdown: String, saveRecordID: String) {
        self.vaultRelativePath = vaultRelativePath; self.markdown = markdown; self.saveRecordID = saveRecordID
    }
    enum CodingKeys: String, CodingKey {
        case vaultRelativePath = "vault_relative_path", markdown, saveRecordID = "save_record_id"
    }
}

public struct ActiveSessionResponse: Codable, Equatable, Sendable {
    public let session: Session
    public let messagesTail: [Message]
    enum CodingKeys: String, CodingKey { case session, messagesTail = "messages_tail" }
}

public struct CreateSessionResponse: Codable, Equatable, Sendable {
    public let sessionID: String
    public let startedAt: String
    enum CodingKeys: String, CodingKey { case sessionID = "session_id", startedAt = "started_at" }
}

public struct HealthResponse: Codable, Equatable, Sendable {
    public let ok: Bool
    public let version: String
    public init(ok: Bool, version: String) { self.ok = ok; self.version = version }
}
