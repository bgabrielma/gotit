import KeyboardShortcuts

internal final class KeyboardShortcutsRegistrar: HotkeyRegistrar, @unchecked Sendable {
    func registerOpenPanel(handler: @escaping @Sendable () -> Void) async {
        await MainActor.run {
            KeyboardShortcuts.onKeyDown(for: .openPanel) { handler() }
        }
    }
    func unregisterAll() async {
        await MainActor.run { KeyboardShortcuts.removeAllHandlers() }
    }
}
