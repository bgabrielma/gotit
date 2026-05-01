import Foundation

public enum APIClientFactory {
    public static func makeNull(
        responses: [Endpoint.ID: any Decodable & Sendable] = [:],
        failures: [Endpoint.ID: APIError] = [:]
    ) -> APIClient {
        NullAPIClient(NullResponses(byEndpoint: responses, failures: failures))
    }

    // makeLive is added in Task 5 once URLSessionAPIClient exists.
}
