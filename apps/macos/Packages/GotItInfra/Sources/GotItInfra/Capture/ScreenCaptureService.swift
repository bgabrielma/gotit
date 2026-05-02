import Foundation
import AppKit

public enum ScreenCaptureError: Error, Equatable, Sendable {
    case permissionDenied
    case noActiveDisplay
    case captureFailed(String)
}

public protocol ScreenCaptureService: Sendable {
    func captureActiveDisplay() async throws -> Data
}

public enum ScreenCaptureServiceFactory {
    public static func makeLive() -> ScreenCaptureService {
        if #available(macOS 14.0, *) {
            return ScreenCaptureKitService()
        }
        return NullScreenCaptureService(data: Data(), error: .permissionDenied)
    }
    public static func makeNull(returning data: Data = Data([0x89, 0x50, 0x4E, 0x47]),
                                 failsWith error: ScreenCaptureError? = nil) -> ScreenCaptureService {
        NullScreenCaptureService(data: data, error: error)
    }
}
