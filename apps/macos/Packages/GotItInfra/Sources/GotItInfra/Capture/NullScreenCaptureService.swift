import Foundation

internal struct NullScreenCaptureService: ScreenCaptureService {
    let data: Data
    let error: ScreenCaptureError?
    func captureActiveDisplay() async throws -> Data {
        if let error { throw error }
        return data
    }
}
