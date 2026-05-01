import Foundation

public protocol OfflineMonitor: Sendable {
    var isOnline: Bool { get async }
    @discardableResult func recheck() async -> Bool
}

public enum OfflineMonitorFactory {
    public static func makeLive(baseURL: URL, session: URLSession = .shared, timeoutMs: Int = 1500) -> OfflineMonitor {
        HealthProbeOfflineMonitor(baseURL: baseURL, session: session, timeoutMs: timeoutMs)
    }
    public static func makeNull(initial: Bool = true) -> ScriptedOfflineMonitor {
        ScriptedOfflineMonitor(initial: initial)
    }
}

public actor ScriptedOfflineMonitor: OfflineMonitor {
    public private(set) var isOnline: Bool
    private var queue: [Bool] = []
    init(initial: Bool) { self.isOnline = initial }
    public func script(results: [Bool]) { queue = results }
    @discardableResult public func recheck() async -> Bool {
        if !queue.isEmpty { isOnline = queue.removeFirst() }
        return isOnline
    }
}

internal actor HealthProbeOfflineMonitor: OfflineMonitor {
    private(set) var isOnline: Bool = true
    private let baseURL: URL
    private let session: URLSession
    private let timeoutMs: Int

    init(baseURL: URL, session: URLSession, timeoutMs: Int) {
        self.baseURL = baseURL; self.session = session; self.timeoutMs = timeoutMs
    }

    @discardableResult func recheck() async -> Bool {
        var req = URLRequest(url: baseURL.appendingPathComponent("health"))
        req.timeoutInterval = TimeInterval(timeoutMs) / 1000.0
        do {
            let (_, resp) = try await session.data(for: req)
            let http = resp as! HTTPURLResponse
            isOnline = (200...299).contains(http.statusCode)
        } catch {
            isOnline = false
        }
        return isOnline
    }
}
