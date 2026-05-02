import Foundation
import os

/// Named logging channels for GotIt! subsystems.
///
/// Usage:
/// ```swift
/// Log.capture.info("Capture started")
/// Log.api.error("Request failed: \(error.localizedDescription)")
/// ```
public enum Log {
    public static let panel = Logger(subsystem: "dev.gotit.macos", category: "panel")
    public static let api = Logger(subsystem: "dev.gotit.macos", category: "api")
    public static let capture = Logger(subsystem: "dev.gotit.macos", category: "capture")
    public static let save = Logger(subsystem: "dev.gotit.macos", category: "save")
}
