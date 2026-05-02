import AppKit

public enum VaultFolderPicker {
    public static func choose() -> URL? {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canCreateDirectories = true
        p.canChooseFiles = false
        p.allowsMultipleSelection = false
        p.prompt = "Choose"
        p.title = "Choose your captures folder"
        return p.runModal() == .OK ? p.url : nil
    }
}
