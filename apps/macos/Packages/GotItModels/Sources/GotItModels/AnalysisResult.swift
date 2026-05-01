import Foundation

public enum ContextKind: String, Codable, Equatable, Sendable {
    case browser_article, code, chat, video, doc, unknown
}

public struct ExtractedURL: Codable, Equatable, Sendable {
    public let href: String
    public let anchor: String?
    public let nearText: String?
    enum CodingKeys: String, CodingKey { case href, anchor, nearText = "near_text" }
    public init(href: String, anchor: String? = nil, nearText: String? = nil) {
        self.href = href; self.anchor = anchor; self.nearText = nearText
    }
}

public struct BBox: Codable, Equatable, Sendable {
    public let x: Double; public let y: Double; public let w: Double; public let h: Double
    public init(x: Double, y: Double, w: Double, h: Double) { self.x = x; self.y = y; self.w = w; self.h = h }
}

public struct Region: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case header, paragraph, code, ui, media }
    public let kind: Kind
    public let text: String
    public let bbox: BBox?
    public init(kind: Kind, text: String, bbox: BBox? = nil) { self.kind = kind; self.text = text; self.bbox = bbox }
}

public struct AnalysisResult: Codable, Equatable, Sendable {
    public let rawText: String
    public let urls: [ExtractedURL]
    public let regions: [Region]
    public let contextKind: ContextKind
    public let summary: String
    enum CodingKeys: String, CodingKey {
        case rawText = "raw_text", urls, regions, contextKind = "context_kind", summary
    }
    public init(rawText: String, urls: [ExtractedURL], regions: [Region], contextKind: ContextKind, summary: String) {
        self.rawText = rawText; self.urls = urls; self.regions = regions
        self.contextKind = contextKind; self.summary = summary
    }
}
