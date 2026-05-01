import Foundation

public actor ScriptedScreenshotWatcher: ScreenshotWatcher {
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    public func start() async {}
    public func stop() async { continuation?.finish() }
    public func events() async -> AsyncStream<ScreenshotEvent> {
        AsyncStream { c in self.continuation = c }
    }
    public func emit(_ event: ScreenshotEvent) async { continuation?.yield(event) }
}
