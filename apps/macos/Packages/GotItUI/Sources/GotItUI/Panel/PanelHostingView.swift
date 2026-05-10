import SwiftUI

public struct PanelHostingView: View {
    @ObservedObject var panel: PanelViewModel
    public init(panel: PanelViewModel) { self.panel = panel }

    public var body: some View {
        ChatView(panel: panel)
    }
}
