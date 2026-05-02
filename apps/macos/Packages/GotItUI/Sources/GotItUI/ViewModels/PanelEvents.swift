import Foundation
import GotItInfra

public enum PanelEvent: Equatable, Sendable {
    case toast(String)
    case error(String)
    case reconnectRequired
    case offlineChanged(Bool)
    case savedTo(URL)
    case permissionRequired(PermissionKind)
}

public enum PermissionKind: String, Equatable, Sendable {
    case screenRecording, vaultFolder
}
