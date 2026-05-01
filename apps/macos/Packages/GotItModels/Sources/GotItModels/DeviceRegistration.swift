import Foundation

public struct DeviceRegistrationRequest: Codable, Equatable, Sendable {
    public let installID: String
    enum CodingKeys: String, CodingKey { case installID = "install_id" }
    public init(installID: String) { self.installID = installID }
}
