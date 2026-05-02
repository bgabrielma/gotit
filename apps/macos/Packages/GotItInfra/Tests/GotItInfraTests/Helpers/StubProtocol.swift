import Foundation

/// URLProtocol subclass that serves a scripted sequence of responses for unit tests.
/// Uses NSLock-protected static state so startLoading() can run synchronously.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    enum Entry {
        case response(status: Int, body: Data)
        case error(Error)
    }

    private static let lock = NSLock()
    private static var _queue: [Entry] = []
    private static var _recorded: [String?] = []

    static let shared = _Actor()

    actor _Actor {
        func script(_ entries: [Entry]) {
            StubProtocol.lock.withLock { StubProtocol._queue = entries }
        }
        func reset() {
            StubProtocol.lock.withLock { StubProtocol._queue = []; StubProtocol._recorded = [] }
        }
        func recordedAuthHeaders() -> [String?] {
            StubProtocol.lock.withLock { StubProtocol._recorded }
        }
    }

    static func makeConfig() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return config
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let req = request
        let auth = req.value(forHTTPHeaderField: "Authorization")
        let entry: Entry? = StubProtocol.lock.withLock {
            StubProtocol._recorded.append(auth)
            return StubProtocol._queue.isEmpty ? nil : StubProtocol._queue.removeFirst()
        }
        // Deliver asynchronously — URLSession rejects synchronous client callbacks with -1011.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let entry else {
                self.client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            switch entry {
            case .response(let status, let body):
                let resp = HTTPURLResponse(
                    url: req.url!, statusCode: status,
                    httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"]
                )!
                self.client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
                if !body.isEmpty { self.client?.urlProtocol(self, didLoad: body) }
                self.client?.urlProtocolDidFinishLoading(self)
            case .error(let error):
                self.client?.urlProtocol(self, didFailWithError: error)
            }
        }
    }

    override func stopLoading() {}
}
