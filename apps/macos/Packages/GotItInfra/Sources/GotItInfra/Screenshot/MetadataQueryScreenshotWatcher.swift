import Foundation

internal final class MetadataQueryScreenshotWatcher: NSObject, ScreenshotWatcher, @unchecked Sendable {
    private let query = NSMetadataQuery()
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    private var stream: AsyncStream<ScreenshotEvent>?
    private var seen: Set<URL> = []

    override init() {
        super.init()
        query.predicate = NSPredicate(format: "kMDItemIsScreenCapture = 1")
        query.searchScopes = [NSMetadataQueryUserHomeScope]
        NotificationCenter.default.addObserver(self, selector: #selector(handleResults(_:)),
            name: .NSMetadataQueryDidFinishGathering, object: query)
        NotificationCenter.default.addObserver(self, selector: #selector(handleResults(_:)),
            name: .NSMetadataQueryDidUpdate, object: query)
    }

    func start() async { await MainActor.run { _ = query.start() } }
    func stop() async { await MainActor.run { query.stop() } }

    func events() async -> AsyncStream<ScreenshotEvent> {
        if let s = stream { return s }
        let s = AsyncStream<ScreenshotEvent> { c in self.continuation = c }
        self.stream = s
        return s
    }

    @objc private func handleResults(_ note: Notification) {
        for i in 0..<query.resultCount {
            guard let item = query.result(at: i) as? NSMetadataItem,
                  let path = item.value(forAttribute: NSMetadataItemPathKey) as? String else { continue }
            let url = URL(fileURLWithPath: path)
            if seen.contains(url) { continue }
            seen.insert(url)
            let date = (item.value(forAttribute: NSMetadataItemContentCreationDateKey) as? Date) ?? Date()
            continuation?.yield(ScreenshotEvent(fileURL: url, createdAt: date))
        }
    }
}
