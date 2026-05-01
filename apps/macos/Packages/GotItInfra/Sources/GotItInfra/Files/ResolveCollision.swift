import Foundation

internal func resolveCollision(existing: [String], candidate: String) -> String {
    let lowercased = Set(existing.map { $0.lowercased() })
    if !lowercased.contains(candidate.lowercased()) { return candidate }
    let url = URL(fileURLWithPath: candidate)
    let base = url.deletingPathExtension().lastPathComponent
    let ext = url.pathExtension
    var n = 1
    while true {
        let next = ext.isEmpty ? "\(base)-\(n)" : "\(base)-\(n).\(ext)"
        if !lowercased.contains(next.lowercased()) { return next }
        n += 1
    }
}
