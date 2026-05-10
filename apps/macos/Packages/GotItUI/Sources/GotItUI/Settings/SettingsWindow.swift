import SwiftUI

public struct SettingsView: View {
    @ObservedObject var settings: SettingsViewModel
    public init(settings: SettingsViewModel) { self.settings = settings }
    public var body: some View {
        TabView {
            generalTab.tabItem { Label(Copy.settingsTabGeneral, systemImage: "gear") }
            HotkeyRecorderView().tabItem { Label(Copy.settingsTabHotkeys, systemImage: "keyboard") }
        }
        .frame(width: 460, height: 280)
    }

    private var generalTab: some View {
        Form {
            TextField(Copy.settingsBackendURL, text: Binding(
                get: { settings.backendURL.absoluteString },
                set: { if let u = URL(string: $0) { settings.setBackendURL(u) } }
            ))
            HStack {
                Text(Copy.settingsVaultLabel)
                Text(settings.vaultFolder?.path ?? Copy.settingsVaultNone).foregroundStyle(.secondary)
                Spacer()
                Button(Copy.buttonChoose) {
                    if let url = VaultFolderPicker.choose() { try? settings.chooseVaultFolder(url) }
                }
            }
        }
        .padding()
    }
}
