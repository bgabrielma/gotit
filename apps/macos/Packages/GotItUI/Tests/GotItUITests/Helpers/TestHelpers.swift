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

/// Writes a minimal valid PNG to a temp file and returns its URL.
func writeTempPNG() throws -> URL {
    // 1×1 red pixel PNG (67 bytes, spec-valid)
    let pngBytes: [UInt8] = [
        0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
        0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
        0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
        0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
        0xDE,0x00,0x00,0x00,0x0C,0x49,0x44,0x41,
        0x54,0x08,0xD7,0x63,0xF8,0xCF,0xC0,0x00,
        0x00,0x00,0x02,0x00,0x01,0xE2,0x21,0xBC,
        0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,
        0x44,0xAE,0x42,0x60,0x82,
    ]
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).png")
    try Data(pngBytes).write(to: url)
    return url
}
