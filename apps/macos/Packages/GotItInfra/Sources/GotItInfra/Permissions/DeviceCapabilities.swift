import Foundation
import AppKit

/// A value snapshot of the device's current permission and hardware state.
public struct CapabilitiesSnapshot: Sendable, Equatable {
    public let screenRecording: Bool
    public let vaultFolder: Bool
    public let displaysCount: Int

    public init(screenRecording: Bool, vaultFolder: Bool, displaysCount: Int) {
        self.screenRecording = screenRecording
        self.vaultFolder = vaultFolder
        self.displaysCount = displaysCount
    }
}

/// A protocol that can query the current device capabilities.
public protocol CapabilityProbe: Sendable {
    func probe() async -> CapabilitiesSnapshot
}

/// An actor that holds the latest `CapabilitiesSnapshot` and can refresh it via `reprobe()`.
public actor DeviceCapabilities {
    /// The most recently probed snapshot.
    public private(set) var snapshot: CapabilitiesSnapshot
    private let probeImpl: CapabilityProbe

    public init(probe: CapabilityProbe) {
        self.probeImpl = probe
        self.snapshot = CapabilitiesSnapshot(screenRecording: false, vaultFolder: false, displaysCount: 0)
    }

    /// Queries the probe and updates `snapshot`. Returns the new snapshot.
    @discardableResult
    public func reprobe() async -> CapabilitiesSnapshot {
        snapshot = await probeImpl.probe()
        return snapshot
    }
}

/// A test-injectable probe whose values can be set programmatically.
/// Ships in the production framework to support UI test injection.
public actor ScriptedCapabilityProbe: CapabilityProbe {
    private var screenRecording = false
    private var vaultFolder = false
    private var displaysCount = 1

    public init() {}

    /// Overrides any subset of the scripted values.
    public func set(screenRecording: Bool? = nil, vaultFolder: Bool? = nil, displaysCount: Int? = nil) {
        if let s = screenRecording { self.screenRecording = s }
        if let v = vaultFolder { self.vaultFolder = v }
        if let d = displaysCount { self.displaysCount = d }
    }

    public func probe() async -> CapabilitiesSnapshot {
        CapabilitiesSnapshot(
            screenRecording: screenRecording,
            vaultFolder: vaultFolder,
            displaysCount: displaysCount
        )
    }
}

/// The production probe that queries real macOS APIs.
public struct LiveCapabilityProbe: CapabilityProbe {
    public let bookmarkStore: SecureBookmarkStore

    public init(bookmarkStore: SecureBookmarkStore) {
        self.bookmarkStore = bookmarkStore
    }

    public func probe() async -> CapabilitiesSnapshot {
        let screen = CGPreflightScreenCaptureAccess()
        let vault = bookmarkStore.tryResolve() != nil
        let displays = NSScreen.screens.count
        return CapabilitiesSnapshot(
            screenRecording: screen,
            vaultFolder: vault,
            displaysCount: displays
        )
    }
}
