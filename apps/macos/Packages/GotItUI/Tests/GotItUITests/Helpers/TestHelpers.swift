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
