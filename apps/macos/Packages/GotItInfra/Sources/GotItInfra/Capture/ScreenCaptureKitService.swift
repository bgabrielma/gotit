import Foundation
import ScreenCaptureKit
import AppKit

@available(macOS 14.0, *)
internal final class ScreenCaptureKitService: ScreenCaptureService, @unchecked Sendable {
    func captureActiveDisplay() async throws -> Data {
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw ScreenCaptureError.permissionDenied
        }
        let mouse = NSEvent.mouseLocation
        let display = content.displays.first(where: { display in
            let frame = CGRect(x: CGFloat(display.frame.origin.x), y: CGFloat(display.frame.origin.y),
                               width: CGFloat(display.width), height: CGFloat(display.height))
            return frame.contains(mouse)
        }) ?? content.displays.first
        guard let display else { throw ScreenCaptureError.noActiveDisplay }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.width = display.width
        cfg.height = display.height
        cfg.showsCursor = false
        do {
            let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
            let rep = NSBitmapImageRep(cgImage: cgImage)
            guard let png = rep.representation(using: .png, properties: [:]) else {
                throw ScreenCaptureError.captureFailed("png encode failed")
            }
            return png
        } catch let e as ScreenCaptureError {
            throw e
        } catch {
            throw ScreenCaptureError.captureFailed(String(describing: error))
        }
    }
}
