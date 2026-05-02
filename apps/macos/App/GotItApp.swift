import SwiftUI
import GotItUI

@main
struct GotItApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        Settings {
            SettingsView(settings: delegate.deps.settings)
        }
    }
}
