import Foundation
import CoreServices

internal final class FSEventsScreenshotWatcher: ScreenshotWatcher, @unchecked Sendable {
    private var continuation: AsyncStream<ScreenshotEvent>.Continuation?
    private var stream: AsyncStream<ScreenshotEvent>?
    private var desktopStream: FSEventStreamRef?
    private var tmpStream: FSEventStreamRef?
    /// Keyed by filename only — same "Screenshot…png" seen via tmpdir and Desktop won't double-fire.
    private var seenFilenames: Set<String> = []
    private let desktopURL: URL
    private let tmpItemsURL: URL

    init() {
        self.desktopURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop")
        self.tmpItemsURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("TemporaryItems")
    }

    func start() async {
        await MainActor.run { startOnMain() }
    }

    func stop() async {
        await MainActor.run {
            [desktopStream, tmpStream].compactMap { $0 }.forEach { ref in
                FSEventStreamStop(ref)
                FSEventStreamInvalidate(ref)
                FSEventStreamRelease(ref)
            }
            desktopStream = nil
            tmpStream = nil
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
        // Mark existing Desktop screenshots as already-seen so we don't re-emit on launch.
        if let existing = try? FileManager.default.contentsOfDirectory(
            at: desktopURL, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        ) {
            existing.filter { isScreenshot($0) }.forEach { seenFilenames.insert($0.lastPathComponent) }
        }

        desktopStream = makeStream(watching: desktopURL, latency: 0.25) { [weak self] in
            self?.scanFlat(self?.desktopURL)
        }
        // Tmpdir: per-file events, minimal latency. Screenshots land here ~200–500ms after keypress.
        tmpStream = makeStream(watching: tmpItemsURL, latency: 0.1) { [weak self] in
            self?.scanTmpItems()
        }
    }

    private func makeStream(watching url: URL, latency: CFTimeInterval, onFire: @escaping () -> Void) -> FSEventStreamRef? {
        // Store the closure on the heap so C can call it.
        let box = Box(onFire)
        var ctx = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passRetained(box).toOpaque(),
            retain: nil,
            release: { ptr in ptr.map { Unmanaged<Box<() -> Void>>.fromOpaque($0).release() } },
            copyDescription: nil
        )
        let cb: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            Unmanaged<Box<() -> Void>>.fromOpaque(info).takeUnretainedValue().value()
        }
        let paths = [url.path] as CFArray
        let flags = FSEventStreamCreateFlags(
            kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer
        )
        guard let ref = FSEventStreamCreate(nil, cb, &ctx, paths, FSEventsGetCurrentEventId(), latency, flags) else {
            return nil
        }
        FSEventStreamSetDispatchQueue(ref, DispatchQueue.main)
        FSEventStreamStart(ref)
        return ref
    }

    /// Scan a flat directory (Desktop) for new screenshots.
    private func scanFlat(_ url: URL?) {
        guard let url,
              let contents = try? FileManager.default.contentsOfDirectory(
                at: url, includingPropertiesForKeys: [.creationDateKey], options: .skipsHiddenFiles
              ) else { return }
        emit(from: contents)
    }

    /// Scan `TemporaryItems/NSIRD_screencaptureui_*/` for new screenshots.
    private func scanTmpItems() {
        guard let subdirs = try? FileManager.default.contentsOfDirectory(
            at: tmpItemsURL, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        ) else { return }

        for subdir in subdirs where subdir.lastPathComponent.hasPrefix("NSIRD_screencaptureui_") {
            guard let files = try? FileManager.default.contentsOfDirectory(
                at: subdir, includingPropertiesForKeys: [.creationDateKey], options: .skipsHiddenFiles
            ) else { continue }
            emit(from: files)
        }
    }

    private func emit(from urls: [URL]) {
        let now = Date()
        for url in urls {
            let filename = url.lastPathComponent
            guard isScreenshot(url), !seenFilenames.contains(filename) else { continue }
            let created = (try? url.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? now
            guard now.timeIntervalSince(created) < 30 else { continue }
            seenFilenames.insert(filename)
            continuation?.yield(ScreenshotEvent(fileURL: url, createdAt: created))
        }
    }

    private func isScreenshot(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        guard ext == "png" || ext == "jpg" || ext == "jpeg" else { return false }
        return url.deletingPathExtension().lastPathComponent.hasPrefix("Screenshot")
    }
}

// MARK: - Helpers

private final class Box<T> {
    let value: T
    init(_ value: T) { self.value = value }
}
