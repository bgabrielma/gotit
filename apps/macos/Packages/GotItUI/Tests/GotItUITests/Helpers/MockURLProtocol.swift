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
