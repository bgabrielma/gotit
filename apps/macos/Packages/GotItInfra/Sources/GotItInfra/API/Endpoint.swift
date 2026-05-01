import Foundation
import GotItModels

public enum CaptureSourceWire: String, Sendable { case screenshot, keybind, refresh, invoke }

public enum Endpoint: Sendable {
    case device(installID: String)
    case health
    case sessionsActive
    case sessionsCreate
    case capture(image: Data, source: CaptureSourceWire)
    case chat(text: String, source: ChatSource)
    case save(instruction: String?)

    public enum ID: Hashable, Sendable {
        case device, health, sessionsActive, sessionsCreate
        case capture, chat, save
    }

    public var id: ID {
        switch self {
        case .device: return .device
        case .health: return .health
        case .sessionsActive: return .sessionsActive
        case .sessionsCreate: return .sessionsCreate
        case .capture: return .capture
        case .chat: return .chat
        case .save: return .save
        }
    }
}
