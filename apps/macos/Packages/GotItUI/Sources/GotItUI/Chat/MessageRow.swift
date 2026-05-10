import SwiftUI
import GotItModels

public struct MessageRow: View {
    let message: Message
    public init(_ message: Message) { self.message = message }
    public var body: some View {
        switch message {
        case .userText(let p):
            bubble(text: p.text, role: .user)
        case .assistant(let p):
            let parsed = ParsedMessage(p.text)
            assistantBubble(body: parsed.body, sources: parsed.sources)
        case .screenCapture(let p):
            bubble(text: "📷 " + p.analysis.summary, role: .assistant)
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
        // Split on the first occurrence of a "Sources:" header (case-insensitive, preceded by newlines)
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

    /// Parses `- [Title](URL)` lines into SourceLink values, skipping malformed entries.
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
