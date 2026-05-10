# F016 — Image Message Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GET /images/:imageRef` backend endpoint and lazy-loading image display in the macOS `MessageRow` so every `screen_capture` message shows the actual captured screenshot, persisted across app relaunches.

**Architecture:** Express route (`imagesRouter`) streams PNG files from `{dataDir}/images/{imageRef}` behind `deviceAuth`. The macOS client adds an `ImageLoader` (`ObservableObject`) that fires an auth-gated `URLRequest` off the main thread and publishes `loading | loaded(NSImage) | failed` states, consumed by a new `CaptureImageBubble` SwiftUI view embedded in `MessageRow`. `ChatView` reads the auth token from keychain once on appear and threads it plus the backend base URL down to each `MessageRow`.

**Tech Stack:** Express 4, Node.js fs, TypeScript strict; Swift 5.9, SwiftUI, `ObservableObject`, `URLSession`, `URLProtocol` (test mocking), macOS 13+.

---

## File Map

| Action | File                                                           | Responsibility                                              |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Create | `packages/api/src/routes/images.ts`                            | `imagesRouter` — serves PNG files with path traversal guard |
| Create | `packages/api/src/__tests__/integration/routes/images.test.ts` | Route integration tests (TDD)                               |
| Modify | `packages/api/src/app.ts`                                      | Wire `/images` route                                        |
| Create | `GotItUI/Sources/GotItUI/Chat/ImageLoader.swift`               | `ObservableObject` image loader with `LoadState`            |
| Create | `GotItUI/Tests/GotItUITests/ImageLoaderTests.swift`            | `ImageLoader` unit tests (TDD)                              |
| Create | `GotItUI/Tests/GotItUITests/Helpers/MockURLProtocol.swift`     | URLProtocol stub for network mocking                        |
| Modify | `GotItUI/Sources/GotItUI/Chat/MessageRow.swift`                | Replace `.screenCapture` text with `CaptureImageBubble`     |
| Modify | `GotItUI/Sources/GotItUI/Chat/ChatView.swift`                  | Thread `imageBaseURL` + `imageToken` to `MessageRow`        |
| Modify | `GotItUI/Sources/GotItUI/Panel/PanelHostingView.swift`         | Accept and forward `imageBaseURL` + `keychain`              |
| Modify | `GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift`  | Add `nonisolated func imageURL(for:) -> URL`                |
| Modify | `apps/macos/App/AppDependencies.swift`                         | Expose `keychain: KeychainStore` as stored property         |
| Modify | `apps/macos/App/AppDelegate.swift`                             | Pass `imageBaseURL` + `keychain` to `PanelHostingView`      |

---

## Task 1: Backend — write failing integration tests

**Files:**

- Create: `packages/api/src/__tests__/integration/routes/images.test.ts`

- [x] **Step 1.1: Create the test file**

```typescript
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { setupAuthedApp, tmpPath, ensureCleanDir, cleanupDir } from '../../helper.js'

const TEST_DATA_DIR = tmpPath('images-test-data')

describe('GET /images/:imageRef', () => {
  beforeEach(() => {
    ensureCleanDir(join(TEST_DATA_DIR, 'images'))
  })

  afterEach(() => {
    cleanupDir(TEST_DATA_DIR)
  })

  it('returns 401 for missing auth token', async () => {
    const { app } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app).get('/images/test.png')
    expect(res.status).toBe(401)
  })

  it('returns 400 for imageRef containing ..', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app).get('/images/..test.png').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for imageRef containing backslash', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    // %5C is URL-encoded backslash
    const res = await request(app)
      .get('/images/foo%5Cbar.png')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown imageRef', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app)
      .get('/images/nonexistent.png')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('returns 200 with PNG content-type for existing image', async () => {
    const imageRef = 'abc123.png'
    // Minimal PNG: 8-byte PNG magic header
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    writeFileSync(join(TEST_DATA_DIR, 'images', imageRef), pngBytes)

    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app)
      .get(`/images/${imageRef}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.type).toBe('image/png')
  })
})
```

- [x] **Step 1.2: Run tests — verify all 5 fail**

```bash
cd packages/api && pnpm test -- images
```

Expected: 5 failures — `imagesRouter` does not exist and `/images` is not wired.

---

## Task 2: Implement `imagesRouter` and wire route

**Files:**

- Create: `packages/api/src/routes/images.ts`
- Modify: `packages/api/src/app.ts`

- [x] **Step 2.1: Create `packages/api/src/routes/images.ts`**

```typescript
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Router } from 'express'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

/** Rejects imageRef values containing path separators or parent-dir traversal sequences. */
const UNSAFE_IMAGEREF = /[/\\]|\.\./

/**
 * Router for serving stored capture images.
 * Requires device authentication. Streams PNG files from {dataDir}/images/.
 */
export function imagesRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.get('/:imageRef', (req, res) => {
    const { imageRef } = req.params

    if (UNSAFE_IMAGEREF.test(imageRef)) {
      res.status(400).json({ error: 'invalid imageRef' })
      return
    }

    const filePath = join(deps.dataDir, 'images', imageRef)

    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.sendFile(filePath)
  })

  return r
}
```

- [x] **Step 2.2: Wire the route in `packages/api/src/app.ts`**

Add the import:

```typescript
import { imagesRouter } from './routes/images.js'
```

Add the route registration (after the `chatRouter` line):

```typescript
app.use('/images', imagesRouter(deps))
```

The full `createApp` function becomes:

```typescript
export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.use('/health', healthRoute(deps))
  app.use('/device', deviceRoute(deps))
  app.use('/sessions', sessionsRouter(deps))
  app.use('/capture', captureRouter(deps))
  app.use('/chat', chatRouter(deps))
  app.use('/save', saveRouter(deps))
  app.use('/images', imagesRouter(deps))

  return app
}
```

- [x] **Step 2.3: Run the images tests — verify all 5 pass**

```bash
cd packages/api && pnpm test -- images
```

Expected: 5 passing tests.

- [x] **Step 2.4: Run full backend test suite — verify no regressions**

```bash
cd packages/api && pnpm test
```

Expected: all tests pass.

- [x] **Step 2.5: Run typecheck and lint**

```bash
cd packages/api && pnpm typecheck && pnpm lint
```

Expected: zero errors.

- [ ] **Step 2.6: Commit**

```bash
git add packages/api/src/routes/images.ts \
        packages/api/src/app.ts \
        packages/api/src/__tests__/integration/routes/images.test.ts
git commit -m "feat(api): add GET /images/:imageRef route with path traversal guard"
```

---

## Task 3: `URLSessionAPIClient.imageURL(for:)` + expose `keychain` in `AppDependencies`

**Files:**

- Modify: `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift`
- Modify: `apps/macos/App/AppDependencies.swift`

- [ ] **Step 3.1: Add `imageURL(for:)` to `URLSessionAPIClient`**

In `apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift`, add the following method after the `init`:

```swift
/** Constructs the URL for a stored image served by the backend. */
nonisolated func imageURL(for imageRef: String) -> URL {
    baseURL.appendingPathComponent("images/\(imageRef)")
}
```

The full file after the change (add between `init` and `nonisolated func send<R: ...>`):

```swift
internal actor URLSessionAPIClient: APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let installID: String

    private let requestTimeout: TimeInterval = 300

    init(baseURL: URL, session: URLSession, keychain: KeychainStore, installID: String) {
        self.baseURL = baseURL
        self.session = session
        self.keychain = keychain
        self.installID = installID
    }

    /** Constructs the URL for a stored image served by the backend. */
    nonisolated func imageURL(for imageRef: String) -> URL {
        baseURL.appendingPathComponent("images/\(imageRef)")
    }

    // ... rest of file unchanged
```

- [ ] **Step 3.2: Store `keychain` in `AppDependencies`**

In `apps/macos/App/AppDependencies.swift`, add `keychain` as a public stored property and expose `imageBaseURL`:

The current `init` creates `keychain` as a local `let`. Promote it to a stored property:

```swift
import Foundation
import GotItInfra
import GotItUI

@MainActor
public final class AppDependencies: ObservableObject {
    public let config: AppConfig
    public let api: APIClient
    public let keychain: KeychainStore          // NEW
    public let monitor: OfflineMonitor
    public let capture: ScreenCaptureService
    public let writer: MarkdownFileWriter
    public let bookmark: SecureBookmarkStore
    public let watcher: ScreenshotWatcher
    public let keypressDetector: ScreenshotKeypressDetector
    public let hotkeys: HotkeyRegistrar
    public let capabilities: DeviceCapabilities
    public let settings: SettingsViewModel
    public let panel: PanelViewModel

    /** The backend base URL, used to construct image request URLs. */
    public var imageBaseURL: URL { config.backendURL }  // NEW

    public init(config: AppConfig) {
        self.config = config
        let keychain = KeychainStoreFactory.makeLive(service: config.keychainService, account: config.keychainAccount)
        self.keychain = keychain                        // NEW: store it
        let bookmark = SecureBookmarkStoreFactory.makeLive()
        self.bookmark = bookmark
        self.api = APIClientFactory.makeLive(baseURL: config.backendURL, keychain: keychain, installID: config.installID)
        self.monitor = OfflineMonitorFactory.makeLive(baseURL: config.backendURL, timeoutMs: config.healthProbeTimeoutMs)
        self.capture = ScreenCaptureServiceFactory.makeLive()
        self.writer = MarkdownFileWriterFactory.makeLive()
        self.watcher = ScreenshotWatcherFactory.makeLive()
        self.keypressDetector = ScreenshotKeypressDetector()
        self.hotkeys = HotkeyRegistrarFactory.makeLive()
        self.capabilities = DeviceCapabilities(probe: LiveCapabilityProbe(bookmarkStore: bookmark))
        self.settings = SettingsViewModel(
            defaults: .standard,
            defaultBackendURL: config.backendURL,
            bookmarkStore: bookmark
        )
        let chat = ChatViewModel(api: api, monitor: monitor)
        self.panel = PanelViewModel(
            api: api, capture: capture, writer: writer, bookmark: bookmark, monitor: monitor, chat: chat
        )
    }
}
```

- [ ] **Step 3.3: Build to verify no compile errors**

```bash
cd apps/macos && xcodebuild -scheme GotIt -configuration Debug build -quiet 2>&1 | tail -20
```

Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3.4: Commit**

```bash
git add apps/macos/Packages/GotItInfra/Sources/GotItInfra/API/URLSessionAPIClient.swift \
        apps/macos/App/AppDependencies.swift
git commit -m "feat(infra): add imageURL(for:) helper and expose keychain in AppDependencies"
```

---

## Task 4: `ImageLoader` — write failing unit tests (TDD)

**Files:**

- Create: `apps/macos/Packages/GotItUI/Tests/GotItUITests/Helpers/MockURLProtocol.swift`
- Create: `apps/macos/Packages/GotItUI/Tests/GotItUITests/ImageLoaderTests.swift`

- [ ] **Step 4.1: Create `MockURLProtocol` helper**

```swift
// apps/macos/Packages/GotItUI/Tests/GotItUITests/Helpers/MockURLProtocol.swift
import Foundation

/** URLProtocol stub used to intercept URLSession requests in unit tests. */
final class MockURLProtocol: URLProtocol {
    /** Set before each test to control the response. */
    static var responseHandler: ((URLRequest) -> (Data, URLResponse, Error?))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        if let handler = MockURLProtocol.responseHandler {
            let (data, response, error) = handler(request)
            if let error {
                client?.urlProtocol(self, didFailWithError: error)
            } else {
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            }
        } else {
            client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
        }
    }

    override func stopLoading() {}
}

/** Creates a URLSession that intercepts all requests via MockURLProtocol. */
func makeMockSession(handler: @escaping (URLRequest) -> (Data, URLResponse, Error?)) -> URLSession {
    MockURLProtocol.responseHandler = handler
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: config)
}

/** Makes a 200 OK HTTPURLResponse for a given URL. */
func makeHTTPResponse(url: URL, statusCode: Int = 200) -> HTTPURLResponse {
    HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
}
```

- [ ] **Step 4.2: Create `ImageLoaderTests.swift` with failing tests**

```swift
// apps/macos/Packages/GotItUI/Tests/GotItUITests/ImageLoaderTests.swift
import Testing
import Foundation
@testable import GotItUI

// 1x1 white PNG, base64-encoded — a real PNG that NSImage can decode.
private let validPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="

@Suite @MainActor struct ImageLoaderTests {
    let testURL = URL(string: "http://localhost/images/a.png")!

    @Test func startsInLoadingState() {
        let loader = ImageLoader(imageURL: testURL, token: nil)
        guard case .loading = loader.state else {
            Issue.record("Expected .loading on init, got \(loader.state)"); return
        }
    }

    @Test func transitionsToLoadedOnValidPNGResponse() async throws {
        let pngData = Data(base64Encoded: validPNGBase64)!
        let session = makeMockSession { req in
            (pngData, makeHTTPResponse(url: req.url!), nil)
        }
        let loader = ImageLoader(imageURL: testURL, token: "test-token", session: session)
        loader.load()

        try await Task.sleep(for: .milliseconds(200))

        guard case .loaded = loader.state else {
            Issue.record("Expected .loaded after valid PNG response, got \(loader.state)"); return
        }
    }

    @Test func attachesAuthorizationHeader() async throws {
        let pngData = Data(base64Encoded: validPNGBase64)!
        var capturedRequest: URLRequest?
        let session = makeMockSession { req in
            capturedRequest = req
            return (pngData, makeHTTPResponse(url: req.url!), nil)
        }
        let loader = ImageLoader(imageURL: testURL, token: "my-token", session: session)
        loader.load()

        try await Task.sleep(for: .milliseconds(200))

        #expect(capturedRequest?.value(forHTTPHeaderField: "Authorization") == "Bearer my-token")
    }

    @Test func transitionsToFailedOnNonImageData() async throws {
        let notPNG = "this is not a PNG".data(using: .utf8)!
        let session = makeMockSession { req in
            (notPNG, makeHTTPResponse(url: req.url!), nil)
        }
        let loader = ImageLoader(imageURL: testURL, token: nil, session: session)
        loader.load()

        try await Task.sleep(for: .milliseconds(200))

        guard case .failed = loader.state else {
            Issue.record("Expected .failed for non-image data, got \(loader.state)"); return
        }
    }

    @Test func transitionsToFailedOnNetworkError() async throws {
        let session = makeMockSession { req in
            (Data(), makeHTTPResponse(url: req.url!, statusCode: 404), URLError(.networkConnectionLost))
        }
        let loader = ImageLoader(imageURL: testURL, token: nil, session: session)
        loader.load()

        try await Task.sleep(for: .milliseconds(200))

        guard case .failed = loader.state else {
            Issue.record("Expected .failed on network error, got \(loader.state)"); return
        }
    }

    @Test func cancelDoesNotCrash() {
        let loader = ImageLoader(imageURL: testURL, token: nil)
        loader.load()
        loader.cancel()
        // Reaching here without a crash confirms cancel() handles an in-flight task safely.
    }
}
```

- [ ] **Step 4.3: Run tests — verify all fail (ImageLoader type does not exist yet)**

```bash
swift test --package-path apps/macos/Packages/GotItUI 2>&1 | tail -30
```

Expected: compile errors — `ImageLoader` not found.

---

## Task 5: Implement `ImageLoader`

**Files:**

- Create: `apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/ImageLoader.swift`

- [ ] **Step 5.1: Create `ImageLoader.swift`**

```swift
// apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/ImageLoader.swift
import Foundation
import AppKit

/**
 * Fetches a single image from the backend via an authenticated URLRequest.
 * Transitions through loading → loaded(NSImage) or failed.
 * Intended to be created as a @StateObject inside CaptureImageBubble.
 */
@MainActor
final class ImageLoader: ObservableObject {
    enum LoadState {
        case loading
        case loaded(NSImage)
        case failed
    }

    @Published private(set) var state: LoadState = .loading

    private let imageURL: URL
    private let token: String?
    private let session: URLSession
    private var loadTask: Task<Void, Never>?

    init(imageURL: URL, token: String?, session: URLSession = .shared) {
        self.imageURL = imageURL
        self.token = token
        self.session = session
    }

    /** Fires the image request. Safe to call multiple times — cancels any in-flight request first. */
    func load() {
        loadTask?.cancel()
        loadTask = Task {
            var request = URLRequest(url: imageURL)
            if let token {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            do {
                let (data, _) = try await session.data(for: request)
                if Task.isCancelled { return }
                guard let image = NSImage(data: data) else {
                    state = .failed
                    return
                }
                state = .loaded(image)
            } catch {
                if !Task.isCancelled {
                    state = .failed
                }
            }
        }
    }

    /** Cancels any in-flight fetch. Call from SwiftUI's onDisappear. */
    func cancel() {
        loadTask?.cancel()
        loadTask = nil
    }
}
```

- [ ] **Step 5.2: Run `ImageLoader` tests — verify all pass**

```bash
swift test --package-path apps/macos/Packages/GotItUI --filter ImageLoaderTests 2>&1 | tail -20
```

Expected: 5 tests pass — `startsInLoadingState`, `transitionsToLoadedOnValidPNGResponse`, `attachesAuthorizationHeader`, `transitionsToFailedOnNonImageData`, `transitionsToFailedOnNetworkError`, `cancelDoesNotCrash`.

- [ ] **Step 5.3: Run full GotItUI test suite — no regressions**

```bash
swift test --package-path apps/macos/Packages/GotItUI 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/ImageLoader.swift \
        apps/macos/Packages/GotItUI/Tests/GotItUITests/ImageLoaderTests.swift \
        apps/macos/Packages/GotItUI/Tests/GotItUITests/Helpers/MockURLProtocol.swift
git commit -m "feat(ui): add ImageLoader with ObservableObject state and unit tests"
```

---

## Task 6: Update `MessageRow`, `ChatView`, `PanelHostingView`, and `AppDelegate`

**Files:**

- Modify: `apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/MessageRow.swift`
- Modify: `apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/ChatView.swift`
- Modify: `apps/macos/Packages/GotItUI/Sources/GotItUI/Panel/PanelHostingView.swift`
- Modify: `apps/macos/App/AppDelegate.swift`

- [ ] **Step 6.1: Update `MessageRow.swift`**

Replace the entire file with:

```swift
import SwiftUI
import GotItModels

public struct MessageRow: View {
    let message: Message
    let imageBaseURL: URL?
    let imageToken: String?

    public init(_ message: Message, imageBaseURL: URL? = nil, imageToken: String? = nil) {
        self.message = message
        self.imageBaseURL = imageBaseURL
        self.imageToken = imageToken
    }

    public var body: some View {
        switch message {
        case .userText(let p):
            bubble(text: p.text, role: .user)
        case .assistant(let p):
            let parsed = ParsedMessage(p.text)
            assistantBubble(body: parsed.body, sources: parsed.sources)
        case .screenCapture(let p):
            captureImageBubble(imageRef: p.imageRef)
        case .saveRecord(let p):
            bubble(text: "💾 saved: " + p.vaultPath, role: .assistant)
        }
    }

    private enum Role { case user, assistant }

    private func bubble(text: String, role: Role) -> some View {
        HStack {
            if role == .user { Spacer(minLength: 24) }
            Text(text)
                .padding(8)
                .background(role == .user ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if role == .assistant { Spacer(minLength: 24) }
        }
    }

    private func assistantBubble(body: String, sources: [SourceLink]) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(body)
                    .padding(8)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                if !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(sources) { source in
                            Link(source.title, destination: source.url)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.leading, 10)
                }
            }
            Spacer(minLength: 24)
        }
    }

    private func captureImageBubble(imageRef: String) -> some View {
        HStack {
            if let imageBaseURL {
                let imageURL = imageBaseURL.appendingPathComponent("images/\(imageRef)")
                CaptureImageBubble(imageURL: imageURL, imageToken: imageToken)
            } else {
                bubble(text: "📷 screenshot", role: .assistant)
            }
            Spacer(minLength: 24)
        }
    }
}

/** Renders a single screen capture image with loading and error states. */
private struct CaptureImageBubble: View {
    let imageURL: URL
    let imageToken: String?
    @StateObject private var loader: ImageLoader

    init(imageURL: URL, imageToken: String?) {
        self.imageURL = imageURL
        self.imageToken = imageToken
        _loader = StateObject(wrappedValue: ImageLoader(imageURL: imageURL, token: imageToken))
    }

    var body: some View {
        Group {
            switch loader.state {
            case .loading:
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.15))
                    .aspectRatio(16 / 9, contentMode: .fit)
            case .loaded(let nsImage):
                Image(nsImage: nsImage)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            case .failed:
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.15))
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay(
                        Image(systemName: "photo.slash")
                            .foregroundStyle(.secondary)
                    )
            }
        }
        .frame(maxWidth: .infinity)
        .task { loader.load() }
        .onDisappear { loader.cancel() }
    }
}

struct SourceLink: Identifiable {
    let id = UUID()
    let title: String
    let url: URL
}

/// Splits an assistant message into body text and a list of source links.
/// Recognises a trailing "Sources:" section with markdown links: `- [Title](URL)`
struct ParsedMessage {
    let body: String
    let sources: [SourceLink]

    init(_ raw: String) {
        let pattern = #"(?i)\n+sources:\n"#
        if let range = raw.range(of: pattern, options: .regularExpression) {
            body = String(raw[raw.startIndex..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            let sourceBlock = String(raw[range.upperBound...])
            sources = Self.parseLinks(from: sourceBlock)
        } else {
            body = raw
            sources = []
        }
    }

    private static func parseLinks(from text: String) -> [SourceLink] {
        let linkPattern = #/- \[(?<title>[^\]]+)\]\((?<url>[^)]+)\)/#
        return text.components(separatedBy: .newlines).compactMap { line in
            guard let match = try? linkPattern.firstMatch(in: line),
                  let url = URL(string: String(match.url))
            else { return nil }
            return SourceLink(title: String(match.title), url: url)
        }
    }
}
```

- [ ] **Step 6.2: Update `ChatView.swift` to thread image auth through**

Add two new properties and a `.task` to read the token. The key changes are:

1. Add `imageBaseURL: URL?` and `keychain: KeychainStore?` to the struct
2. Add `@State private var imageToken: String? = nil`
3. Update `init` to accept the new optional parameters
4. Add `.task { imageToken = try? await keychain?.read() }` on the `VStack`
5. Pass `imageBaseURL` and `imageToken` to each `MessageRow`

Replace the top of `ChatView.swift` (up through `public init`) with:

```swift
import SwiftUI
import UniformTypeIdentifiers
import GotItModels
import GotItInfra

public struct ChatView: View {
    @ObservedObject var panel: PanelViewModel
    @ObservedObject var chat: ChatViewModel
    @State private var draft: String = ""
    @State private var isOnline: Bool = true
    @State private var imageToken: String? = nil
    private let bottomAnchorID = "chat-bottom-anchor"
    private let imageBaseURL: URL?
    private let keychain: KeychainStore?

    private static let imageTypes: [UTType] = [.image, .png, .jpeg, .heic, .gif, .webP]

    public init(panel: PanelViewModel, imageBaseURL: URL? = nil, keychain: KeychainStore? = nil) {
        self.panel = panel
        self.chat = panel.chat
        self.imageBaseURL = imageBaseURL
        self.keychain = keychain
    }
```

In the `body`, update the `ForEach` that renders `MessageRow` to pass the image parameters:

Replace:

```swift
ForEach(Array(chat.messages.enumerated()), id: \.offset) { _, m in
    MessageRow(m)
}
```

With:

```swift
ForEach(Array(chat.messages.enumerated()), id: \.offset) { _, m in
    MessageRow(m, imageBaseURL: imageBaseURL, imageToken: imageToken)
}
```

Add `.task { imageToken = try? await keychain?.read() }` on the `VStack(spacing: 0)`. Add it after the `.frame(width: 460)` modifier:

```swift
.frame(width: 460)
.task {
    imageToken = try? await keychain?.read()
}
// ... existing .background modifier follows
```

- [ ] **Step 6.3: Update `PanelHostingView.swift`**

Replace the entire file with:

```swift
import SwiftUI
import GotItInfra

public struct PanelHostingView: View {
    @ObservedObject var panel: PanelViewModel
    private let imageBaseURL: URL?
    private let keychain: KeychainStore?

    public init(panel: PanelViewModel, imageBaseURL: URL? = nil, keychain: KeychainStore? = nil) {
        self.panel = panel
        self.imageBaseURL = imageBaseURL
        self.keychain = keychain
    }

    public var body: some View {
        ChatView(panel: panel, imageBaseURL: imageBaseURL, keychain: keychain)
    }
}
```

- [ ] **Step 6.4: Update `AppDelegate.swift` — pass image parameters to `PanelHostingView`**

In `AppDelegate.swift`, find the `installPanel()` method:

```swift
private func installPanel() {
    let host = PanelHostingView(panel: deps.panel)
    panelWindow = FloatingPanel(rootView: host)
    Task { await deps.panel.chat.start() }
}
```

Replace with:

```swift
private func installPanel() {
    let host = PanelHostingView(
        panel: deps.panel,
        imageBaseURL: deps.imageBaseURL,
        keychain: deps.keychain
    )
    panelWindow = FloatingPanel(rootView: host)
    Task { await deps.panel.chat.start() }
}
```

- [ ] **Step 6.5: Build to verify no compile errors**

```bash
cd apps/macos && xcodebuild -scheme GotIt -configuration Debug build -quiet 2>&1 | tail -20
```

Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6.6: Run full Swift test suite — no regressions**

```bash
swift test --package-path apps/macos/Packages/GotItModels && \
swift test --package-path apps/macos/Packages/GotItInfra && \
swift test --package-path apps/macos/Packages/GotItUI
```

Expected: all suites pass.

- [ ] **Step 6.7: Commit**

```bash
git add apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/MessageRow.swift \
        apps/macos/Packages/GotItUI/Sources/GotItUI/Chat/ChatView.swift \
        apps/macos/Packages/GotItUI/Sources/GotItUI/Panel/PanelHostingView.swift \
        apps/macos/App/AppDelegate.swift
git commit -m "feat(ui): display screen capture images lazily in MessageRow with auth"
```

---

## Task 7: Final validation

- [ ] **Step 7.1: Run the full backend validation pipeline**

```bash
cd packages/api && pnpm typecheck && pnpm lint && pnpm test
```

Expected: zero errors, all tests pass.

- [ ] **Step 7.2: Run purity check**

```bash
pnpm purity-check
```

Expected: clean — no side effects introduced in `packages/core/`.

- [ ] **Step 7.3: Run full macOS swift tests**

```bash
swift test --package-path apps/macos/Packages/GotItModels && \
swift test --package-path apps/macos/Packages/GotItInfra && \
swift test --package-path apps/macos/Packages/GotItUI
```

Expected: all pass.

- [ ] **Step 7.4: Build Release and smoke test**

```bash
cd apps/macos && xcodebuild -scheme GotIt -configuration Release build -quiet 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`

Launch the built app and send a screen capture. Verify:

- While the image loads: grey 16:9 placeholder is shown in the message bubble
- After load: captured screenshot renders inline
- On app relaunch: images reload from disk (not lost)
- On unknown imageRef: grey placeholder with `photo.slash` icon

---

## Sprint Contract

### Success Criteria

- [ ] `GET /images/:imageRef` returns 200 + `image/png` for existing files behind `deviceAuth`
- [ ] Path traversal attempts (`..`, `\`, `/` in imageRef) return 400
- [ ] Missing imageRef returns 404
- [ ] Missing auth returns 401
- [ ] `ImageLoader` transitions `loading → loaded(NSImage)` on valid PNG response
- [ ] `ImageLoader` transitions `loading → failed` on network error or non-image data
- [ ] `ImageLoader` attaches `Authorization: Bearer {token}` header
- [ ] `screen_capture` messages display inline image instead of `"📷 " + summary` text
- [ ] Loading state renders grey 16:9 placeholder
- [ ] Failed state renders grey placeholder with `photo.slash` SF Symbol
- [ ] Images persist across app relaunches
- [ ] All backend tests pass, no TypeScript errors, no lint errors
- [ ] All Swift package tests pass, app builds in Debug and Release

### Quality Gate

- Minimum score: 7/10
- Scoring: functionality (30%), code quality (20%), test coverage (20%), spec conformance (20%), lint + types (10%)
