import Testing
import Foundation
@testable import GotItUI

@Suite(.serialized) @MainActor struct ImageLoaderTests {
    let testURL = URL(string: "http://localhost/images/a.png")!

    @Test func startsInLoadingState() {
        let loader = ImageLoader(imageURL: testURL, token: nil)
        guard case .loading = loader.state else {
            Issue.record("Expected .loading on init, got \(loader.state)")
            return
        }
    }

    @Test func transitionsToLoadedOnValidPNGResponse() async throws {
        let pngData = try fixtureData(named: "screenshot-sample.png")
        let session = makeMockSession { req in
            (pngData, makeHTTPResponse(url: req.url!), nil)
        }
        let loader = ImageLoader(imageURL: testURL, token: "test-token", session: session)
        loader.load()

        try await Task.sleep(for: .milliseconds(200))

        guard case .loaded = loader.state else {
            Issue.record("Expected .loaded after valid PNG response, got \(loader.state)")
            return
        }
    }

    @Test func attachesAuthorizationHeader() async throws {
        let pngData = try fixtureData(named: "screenshot-sample.png")
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
            Issue.record("Expected .failed for non-image data, got \(loader.state)")
            return
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
            Issue.record("Expected .failed on network error, got \(loader.state)")
            return
        }
    }

    @Test func cancelDoesNotCrash() {
        let loader = ImageLoader(imageURL: testURL, token: nil)
        loader.load()
        loader.cancel()
    }
}
