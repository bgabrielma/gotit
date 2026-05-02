import Foundation
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    public static let openPanel = Self("openPanel", default: .init(.space, modifiers: [.command, .shift]))
}

public protocol HotkeyRegistrar: Sendable {
    func registerOpenPanel(handler: @escaping @Sendable () -> Void) async
    func unregisterAll() async
}

public enum HotkeyRegistrarFactory {
    public static func makeLive() -> HotkeyRegistrar { KeyboardShortcutsRegistrar() }
    public static func makeNull() -> ScriptedHotkeyRegistrar { ScriptedHotkeyRegistrar() }
}
