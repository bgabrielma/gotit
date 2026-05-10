import SwiftUI
import KeyboardShortcuts

public struct HotkeyRecorderView: View {
    public init() {}
    public var body: some View {
        Form {
            KeyboardShortcuts.Recorder(Copy.hotkeyOpenPanel, name: .openPanel)
        }
        .padding()
        .frame(width: 320)
    }
}
