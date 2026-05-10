import Foundation
import AppKit

/**
 * Fetches a single image from the backend via an authenticated URLRequest.
 * Transitions through loading -> loaded(NSImage) or failed.
 * Intended to be created as a @StateObject inside CaptureImageBubble.
 */
@MainActor
final class ImageLoader: ObservableObject {
    enum LoadState {
        case loading
        case loaded(NSImage)
        case failed
    }

    @Published private(set) var state: LoadState = .loading

    private let imageURL: URL
    private let token: String?
    private let session: URLSession
    private var loadTask: Task<Void, Never>?

    init(imageURL: URL, token: String?, session: URLSession = .shared) {
        self.imageURL = imageURL
        self.token = token
        self.session = session
    }

    /** Fires the image request. Safe to call multiple times - cancels any in-flight request first. */
    func load() {
        loadTask?.cancel()
        loadTask = Task {
            var request = URLRequest(url: imageURL)
            if let token {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            do {
                let (data, _) = try await session.data(for: request)
                if Task.isCancelled {
                    return
                }

                guard let image = NSImage(data: data) else {
                    state = .failed
                    return
                }

                state = .loaded(image)
            } catch {
                if !Task.isCancelled {
                    state = .failed
                }
            }
        }
    }

    /** Cancels any in-flight fetch. Call from SwiftUI's onDisappear. */
    func cancel() {
        loadTask?.cancel()
        loadTask = nil
    }
}
