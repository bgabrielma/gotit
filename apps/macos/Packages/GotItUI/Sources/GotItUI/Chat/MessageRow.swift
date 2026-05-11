import SwiftUI
import GotItModels

public struct MessageRow: View {
    let message: Message
    let imageBaseURL: URL?
    let imageToken: String?

    public init(_ message: Message, imageBaseURL: URL? = nil, imageToken: String? = nil) {
        self.message = message
        self.imageBaseURL = imageBaseURL
        self.imageToken = imageToken
    }

    public var body: some View {
        switch message {
        case .userText(let p):
            bubble(text: p.text, role: .user)
        case .assistant(let p):
            let parsed = ParsedMessage(p.text)
            assistantBubble(body: parsed.body, sources: parsed.sources)
        case .screenCapture(let p):
            captureImageBubble(imageRef: p.imageRef)
        case .saveRecord(let p):
            bubble(text: "💾 saved: " + p.vaultPath, role: .assistant)
        }
    }

    private enum Role { case user, assistant }

    private func bubble(text: String, role: Role) -> some View {
        HStack {
            if role == .user { Spacer(minLength: 24) }
            Text(text)
                .padding(8)
                .background(role == .user ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if role == .assistant { Spacer(minLength: 24) }
        }
    }

    private func assistantBubble(body: String, sources: [SourceLink]) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(body)
                    .padding(8)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                if !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(sources) { source in
                            Link(source.title, destination: source.url)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.leading, 10)
                }
            }
            Spacer(minLength: 24)
        }
    }

    private func captureImageBubble(imageRef: String) -> some View {
        HStack {
            if let imageBaseURL {
                let imageURL = imageBaseURL.appendingPathComponent("images/\(imageRef)")
                CaptureImageBubble(imageURL: imageURL, imageToken: imageToken)
            } else {
                bubble(text: "📷 screenshot", role: .assistant)
            }
            Spacer(minLength: 24)
        }
    }
}

/** Renders a single screen capture image with loading and error states. */
private struct CaptureImageBubble: View {
    let imageURL: URL
    let imageToken: String?
    @StateObject private var loader: ImageLoader

    init(imageURL: URL, imageToken: String?) {
        self.imageURL = imageURL
        self.imageToken = imageToken
        _loader = StateObject(wrappedValue: ImageLoader(imageURL: imageURL, token: imageToken))
    }

    var body: some View {
        Group {
            switch loader.state {
            case .loading:
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.15))
                    .aspectRatio(16 / 9, contentMode: .fit)
            case .loaded(let nsImage):
                Image(nsImage: nsImage)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(ImageClickOverlay { ImagePreviewPanel.show(image: nsImage) })
            case .failed:
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.15))
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay(
                        Image(systemName: "photo.slash")
                            .foregroundStyle(.secondary)
                    )
            }
        }
        .frame(maxWidth: 220, maxHeight: 130)
        .task { loader.load() }
        .onChange(of: imageToken) { newToken in loader.reload(token: newToken) }
        .onDisappear { loader.cancel() }
    }
}

struct SourceLink: Identifiable {
    let id = UUID()
    let title: String
    let url: URL
}

/// Splits an assistant message into body text and a list of source links.
/// Recognises a trailing "Sources:" section with markdown links: `- [Title](URL)`
struct ParsedMessage {
    let body: String
    let sources: [SourceLink]

    init(_ raw: String) {
        let pattern = #"(?i)\n+sources:\n"#
        if let range = raw.range(of: pattern, options: .regularExpression) {
            body = String(raw[raw.startIndex..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            let sourceBlock = String(raw[range.upperBound...])
            sources = Self.parseLinks(from: sourceBlock)
        } else {
            body = raw
            sources = []
        }
    }

    private static func parseLinks(from text: String) -> [SourceLink] {
        let linkPattern = #/- \[(?<title>[^\]]+)\]\((?<url>[^)]+)\)/#
        return text.components(separatedBy: .newlines).compactMap { line in
            guard let match = try? linkPattern.firstMatch(in: line),
                  let url = URL(string: String(match.url))
            else { return nil }
            return SourceLink(title: String(match.title), url: url)
        }
    }
}
