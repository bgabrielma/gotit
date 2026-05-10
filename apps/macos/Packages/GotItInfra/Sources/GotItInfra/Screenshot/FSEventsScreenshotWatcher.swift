import Foundation
import CoreServices

internal final class FSEventsScreenshotWatcher: ScreenshotWatcher, @unchecked Sendable {
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    private var stream: AsyncStream<ScreenshotEvent>?
    private var eventStream: FSEventStreamRef?
    private var seen: Set<URL> = []
    private let watchURL: URL

    init() {
        self.watchURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop")
    }

    func start() async {
        await MainActor.run { startOnMain() }
    }

    func stop() async {
        await MainActor.run {
            guard let ref = eventStream else { return }
            FSEventStreamStop(ref)
            FSEventStreamInvalidate(ref)
            FSEventStreamRelease(ref)
            eventStream = nil
        }
    }

    func events() async -> AsyncStream<ScreenshotEvent> {
        if let s = stream { return s }
        let s = AsyncStream<ScreenshotEvent> { c in self.continuation = c }
        self.stream = s
        return s
    }

    // MARK: - Private

    private func startOnMain() {
        // Mark existing screenshots as already-seen so we don't re-emit them on launch.
        if let existing = try? FileManager.default.contentsOfDirectory(
            at: watchURL, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        ) {
            existing.filter { isScreenshot($0) }.forEach { seen.insert($0) }
        }

        var ctx = FSEventStreamContext(version: 0,
                                       info: Unmanaged.passUnretained(self).toOpaque(),
                                       retain: nil, release: nil, copyDescription: nil)

        let cb: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            Unmanaged<FSEventsScreenshotWatcher>.fromOpaque(info)
                .takeUnretainedValue()
                .checkForNewScreenshots()
        }

        let paths = [watchURL.path] as CFArray
        // kFSEventStreamCreateFlagFileEvents — per-file granularity
        // kFSEventStreamCreateFlagNoDefer    — fire ASAP, don't coalesce
        let flags = FSEventStreamCreateFlags(
            kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer
        )
        guard let ref = FSEventStreamCreate(
            nil, cb, &ctx, paths,
            FSEventsGetCurrentEventId(),
            0.25,
            flags
        ) else { return }

        FSEventStreamSetDispatchQueue(ref, DispatchQueue.main)
        FSEventStreamStart(ref)
        eventStream = ref
    }

    private func checkForNewScreenshots() {
        guard let contents = try? FileManager.default.contentsOfDirectory(
            at: watchURL,
            includingPropertiesForKeys: [.creationDateKey],
            options: .skipsHiddenFiles
        ) else { return }

        let now = Date()
        for url in contents {
            guard isScreenshot(url), !seen.contains(url) else { continue }
            let created = (try? url.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? now
            guard now.timeIntervalSince(created) < 30 else { continue }
            seen.insert(url)
            continuation?.yield(ScreenshotEvent(fileURL: url, createdAt: created))
        }
    }

    private func isScreenshot(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        guard ext == "png" || ext == "jpg" || ext == "jpeg" else { return false }
        return url.deletingPathExtension().lastPathComponent.hasPrefix("Screenshot")
    }
}
