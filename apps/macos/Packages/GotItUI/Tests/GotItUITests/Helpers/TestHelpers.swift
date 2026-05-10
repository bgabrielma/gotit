import Foundation
import GotItInfra
@testable import GotItUI

@MainActor
func makeVM(api: APIClient,
            capture: ScreenCaptureService = ScreenCaptureServiceFactory.makeNull(),
            writer: MarkdownFileWriter = MarkdownFileWriterFactory.makeNull(),
            bookmark: SecureBookmarkStore = SecureBookmarkStoreFactory.makeNull(),
            monitor: OfflineMonitor = OfflineMonitorFactory.makeNull()) -> PanelViewModel {
    PanelViewModel(
        api: api, capture: capture, writer: writer, bookmark: bookmark, monitor: monitor,
        chat: ChatViewModel(api: api, monitor: monitor)
    )
}

func makeTempDir() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

func fixtureURL(named fileName: String) -> URL {
    URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Fixtures")
        .appendingPathComponent(fileName)
}

func fixtureData(named fileName: String) throws -> Data {
    try Data(contentsOf: fixtureURL(named: fileName))
}

/// Writes the real screenshot fixture PNG to a temp file and returns its URL.
func writeTempPNG() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).png")
    try fixtureData(named: "screenshot-sample.png").write(to: url)
    return url
}
