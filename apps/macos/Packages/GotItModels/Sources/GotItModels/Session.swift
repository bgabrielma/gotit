import Foundation

public struct Session: Codable, Equatable, Sendable {
    public let id: String
    public let deviceID: String
    public let startedAt: String
    public let endedAt: String?
    enum CodingKeys: String, CodingKey {
        case id, deviceID = "device_id", startedAt = "started_at", endedAt = "ended_at"
    }
    public init(id: String, deviceID: String, startedAt: String, endedAt: String? = nil) {
        self.id = id; self.deviceID = deviceID; self.startedAt = startedAt; self.endedAt = endedAt
    }
}
