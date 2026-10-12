import Foundation

// STUB — API contract only. Implementation pending (see NetworkingTests).

/// Last-good copy of a video's clips, used when the network fails.
protocol ClipCache: Sendable {
    func load(_ videoId: String) async -> [LessonClip]?
    func save(_ clips: [LessonClip], for videoId: String) async
}

/// Clips per POC video: one network request per video per session,
/// shared by concurrent callers and prefetches.
actor ClipStore {
    typealias Fetch = @Sendable (String) async throws -> [LessonClip]

    private let fetch: Fetch
    private let cache: ClipCache?

    init(fetch: @escaping Fetch, cache: ClipCache? = nil) {
        self.fetch = fetch
        self.cache = cache
    }

    func clips(for videoId: String) async throws -> [LessonClip] {
        try await fetch(videoId)
    }

    func prefetch(_ videoId: String) {}

    func invalidate(_ videoId: String) {}
}
