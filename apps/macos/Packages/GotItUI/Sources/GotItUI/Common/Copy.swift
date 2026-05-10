import Foundation

public enum Copy {
    private static func s(_ key: String) -> String {
        NSLocalizedString(key, bundle: .module, comment: "")
    }

    // MARK: Input bar
    public static let inputPlaceholder   = s("input.placeholder")
    public static let buttonLookAgain    = s("button.look_again")
    public static let buttonSave         = s("button.save")
    public static let buttonReset        = s("button.reset")
    public static let buttonConnect      = s("button.connect")
    public static let buttonSkip         = s("button.skip")
    public static let buttonChoose       = s("button.choose")

    // MARK: Notifications
    public static let screenshotCaptured = s("toast.screenshot_captured")
    public static let awaitingScreenshot  = s("awaiting.screenshot")
    public static func savedTo(_ filename: String) -> String {
        String(format: s("toast.saved_to"), filename)
    }

    // MARK: Offline
    public static let bannerOffline      = s("banner.offline")

    // MARK: Permission prompts
    public static let screenRecordingTitle   = s("permission.screen_recording.title")
    public static let screenRecordingMessage = s("permission.screen_recording.message")
    public static let screenRecordingCta     = s("permission.screen_recording.cta")
    public static let vaultFolderTitle       = s("permission.vault_folder.title")
    public static let vaultFolderMessage     = s("permission.vault_folder.message")
    public static let vaultFolderCta         = s("permission.vault_folder.cta")
    public static let reconnectTitle         = s("permission.reconnect.title")
    public static let reconnectMessage       = s("permission.reconnect.message")
    public static let reconnectCta           = s("permission.reconnect.cta")

    // MARK: Onboarding
    public static let onboardingTitle           = s("onboarding.title")
    public static let onboardingDescription     = s("onboarding.description")
    public static let onboardingURLPlaceholder  = s("onboarding.backend_url_placeholder")

    // MARK: Settings
    public static let settingsBackendURL    = s("settings.backend_url")
    public static let settingsVaultLabel    = s("settings.vault_folder_label")
    public static let settingsVaultNone     = s("settings.vault_not_chosen")
    public static let settingsTabGeneral    = s("settings.tab_general")
    public static let settingsTabHotkeys    = s("settings.tab_hotkeys")

    // MARK: Vault picker
    public static let vaultPickerTitle  = s("vault_picker.title")
    public static let vaultPickerButton = s("vault_picker.button")

    // MARK: Hotkey recorder
    public static let hotkeyOpenPanel = s("hotkey.open_panel")
}
