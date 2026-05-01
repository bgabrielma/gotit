import Foundation

public enum APIError: Error, Equatable, Sendable {
    case offline
    case unauthorized
    case http(status: Int, message: String?)
    case transport(String)
    case decoding(String)
    case nullNotConfigured(String)
}
