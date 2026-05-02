public actor ScriptedHotkeyRegistrar: HotkeyRegistrar {
    private var handler: (@Sendable () -> Void)?
    public func registerOpenPanel(handler: @escaping @Sendable () -> Void) async { self.handler = handler }
    public func unregisterAll() async { handler = nil }
    public func fire() async { handler?() }
}
