import SwiftUI

public struct SettingsView: View {
    @ObservedObject var settings: SettingsViewModel
    public init(settings: SettingsViewModel) { self.settings = settings }
    public var body: some View {
        TabView {
            generalTab.tabItem { Label("General", systemImage: "gear") }
            HotkeyRecorderView().tabItem { Label("Hotkeys", systemImage: "keyboard") }
        }
        .frame(width: 460, height: 280)
    }

    private var generalTab: some View {
        Form {
            TextField("Backend URL", text: Binding(
                get: { settings.backendURL.absoluteString },
                set: { if let u = URL(string: $0) { settings.setBackendURL(u) } }
            ))
            HStack {
                Text("Vault folder:")
                Text(settings.vaultFolder?.path ?? "— not chosen —").foregroundStyle(.secondary)
                Spacer()
                Button("Choose…") {
                    if let url = VaultFolderPicker.choose() { try? settings.chooseVaultFolder(url) }
                }
            }
        }
        .padding()
    }
}
