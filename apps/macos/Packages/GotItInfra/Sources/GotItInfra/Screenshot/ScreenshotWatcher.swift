import Foundation

public struct ScreenshotEvent: Sendable, Equatable {
    public let fileURL: URL
    public let createdAt: Date
}

public protocol ScreenshotWatcher: Sendable {
    func start() async
    func stop() async
    func events() async -> AsyncStream<ScreenshotEvent>
}

public enum ScreenshotWatcherFactory {
    public static func makeLive() -> ScreenshotWatcher { MetadataQueryScreenshotWatcher() }
    public static func makeNull() -> ScriptedScreenshotWatcher { ScriptedScreenshotWatcher() }
}
