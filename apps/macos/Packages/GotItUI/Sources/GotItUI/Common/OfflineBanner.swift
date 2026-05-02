import SwiftUI

public struct OfflineBanner: View {
    public init() {}
    public var body: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text("You're offline. Reconnect the backend to send.")
            Spacer()
        }
        .padding(8)
        .background(Color.orange.opacity(0.2))
    }
}
