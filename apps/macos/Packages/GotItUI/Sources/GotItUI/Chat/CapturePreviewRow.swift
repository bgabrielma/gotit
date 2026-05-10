import SwiftUI
import AppKit

struct CapturePreviewRow: View {
    let imageData: Data

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Spacer(minLength: 24)
                if let nsImage = NSImage(data: imageData) {
                    Image(nsImage: nsImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: 220, maxHeight: 130)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.accentColor.opacity(0.3), lineWidth: 1))
                }
            }
            HStack {
                TypingIndicator()
                    .padding(8)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Spacer(minLength: 24)
            }
        }
    }
}
