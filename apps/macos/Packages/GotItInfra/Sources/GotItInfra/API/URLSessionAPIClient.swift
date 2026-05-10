import Foundation
import GotItModels

internal actor URLSessionAPIClient: APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let installID: String

    private let requestTimeout: TimeInterval = 300 // 5 minutes

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

    nonisolated func send<R: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> R {
        try await sendOnce(endpoint, allowRepair: true)
    }

    private func sendOnce<R: Decodable & Sendable>(_ endpoint: Endpoint, allowRepair: Bool) async throws -> R {
        let req = try await buildRequest(endpoint)
        let (data, resp) = try await performWithRetry(req)
        let http = resp as! HTTPURLResponse

        switch http.statusCode {
        case 200...299:
            return try decode(R.self, data: data)

        case 401:
            if case .device = endpoint {
                throw APIError.unauthorized
            }

            guard allowRepair else {
                throw APIError.unauthorized
            }

            try await rePair()
            return try await sendOnce(endpoint, allowRepair: false)

        case 400...499:
            throw APIError.http(
                status: http.statusCode,
                message: String(data: data, encoding: .utf8)
            )

        default:
            throw APIError.http(
                status: http.statusCode,
                message: String(data: data, encoding: .utf8)
            )
        }
    }

    private func rePair() async throws {
        try await keychain.delete()

        let resp: DeviceRegistrationResponse = try await sendOnce(
            .device(installID: installID),
            allowRepair: false
        )

        try await keychain.write(resp.token)
    }

    private func performWithRetry(_ req: URLRequest) async throws -> (Data, URLResponse) {
        let backoffs: [UInt64] = [0, 250_000_000, 500_000_000]
        var last: Error?

        for delay in backoffs {
            if delay > 0 {
                try await Task.sleep(nanoseconds: delay)
            }

            do {
                let (data, resp) = try await session.data(for: req)
                let http = resp as! HTTPURLResponse

                if (500...599).contains(http.statusCode) {
                    last = APIError.http(status: http.statusCode, message: nil)
                    continue
                }

                return (data, resp)
            } catch {
                last = error

                if !isRetryable(error) {
                    throw APIError.transport(String(describing: error))
                }
            }
        }

        throw APIError.transport(String(describing: last ?? URLError(.unknown)))
    }

    private func isRetryable(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else {
            return false
        }

        switch urlError.code {
        case .timedOut, .networkConnectionLost, .notConnectedToInternet, .cannotConnectToHost:
            return true

        default:
            return false
        }
    }

    private func buildRequest(_ endpoint: Endpoint) async throws -> URLRequest {
        var req: URLRequest

        switch endpoint {
        case .device(let installID):
            req = URLRequest(url: baseURL.appendingPathComponent("device"))
            req.httpMethod = "POST"
            req.timeoutInterval = requestTimeout
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(
                DeviceRegistrationRequest(installID: installID)
            )
            return req // device call is unauthenticated

        case .health:
            req = URLRequest(url: baseURL.appendingPathComponent("health"))
            req.httpMethod = "GET"

        case .sessionsActive:
            req = URLRequest(url: baseURL.appendingPathComponent("sessions/active"))
            req.httpMethod = "GET"

        case .sessionsCreate:
            req = URLRequest(url: baseURL.appendingPathComponent("sessions"))
            req.httpMethod = "POST"

        case .capture(let image, let source):
            req = URLRequest(url: baseURL.appendingPathComponent("capture"))
            req.httpMethod = "POST"

            let boundary = "----GotItBoundary\(UUID().uuidString)"

            req.setValue(
                "multipart/form-data; boundary=\(boundary)",
                forHTTPHeaderField: "Content-Type"
            )

            req.httpBody = makeMultipartBody(
                boundary: boundary,
                image: image,
                source: source.rawValue
            )

        case .chat(let text, let source):
            req = URLRequest(url: baseURL.appendingPathComponent("chat"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(
                ChatRequest(text: text, source: source)
            )

        case .save(let instruction):
            req = URLRequest(url: baseURL.appendingPathComponent("save"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(
                SaveRequest(instruction: instruction)
            )
        }

        req.timeoutInterval = requestTimeout

        if let token = try? await keychain.read(), !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return req
    }

    private func makeMultipartBody(boundary: String, image: Data, source: String) -> Data {
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"source\"\r\n\r\n\(source)\r\n"
                .data(using: .utf8)!
        )

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            """
            Content-Disposition: form-data; name="image"; filename="capture.png"\r
            Content-Type: image/png\r
            \r

            """
            .data(using: .utf8)!
        )

        body.append(image)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        return body
    }

    private func decode<R: Decodable>(_ type: R.Type, data: Data) throws -> R {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }
}
