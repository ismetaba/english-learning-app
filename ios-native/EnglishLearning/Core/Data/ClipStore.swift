import Foundation

/// Last-good copy of a video's clips, used when the network fails.
protocol ClipCache: Sendable {
    func load(_ videoId: String) async -> [LessonClip]?
    func save(_ clips: [LessonClip], for videoId: String) async
}

/// Clips per POC video: one network request per video per session,
/// shared by concurrent callers and prefetches.
///
/// The clips endpoint takes 4–33s, so the set flow prefetches the next
/// video while the current one plays and both paths join the same
/// in-flight request. The network stays the source of truth each session
/// (tagging still changes server-side); the disk copy is only an offline
/// fallback.
actor ClipStore {
    typealias Fetch = @Sendable (String) async throws -> [LessonClip]

    static let shared = ClipStore(
        fetch: { try await APIClient.shared.fetchPocVideoClips(videoId: $0) },
        cache: DiskClipCache()
    )

    private let fetch: Fetch
    private let cache: ClipCache?
    /// Successful fetches this session. Failures and cache fallbacks are
    /// never stored here, so the next call goes back to the network.
    private var memo: [String: [LessonClip]] = [:]
    private var inFlight: [String: Task<[LessonClip], Error>] = [:]

    init(fetch: @escaping Fetch, cache: ClipCache? = nil) {
        self.fetch = fetch
        self.cache = cache
    }

    func clips(for videoId: String) async throws -> [LessonClip] {
        if let memoized = memo[videoId] { return memoized }
        let task = inFlight[videoId] ?? start(videoId)
        do {
            return try await task.value
        } catch {
            if let lastGood = await cache?.load(videoId) { return lastGood }
            throw error
        }
    }

    /// Warms `videoId` in the background. Fire-and-forget: a failure here
    /// is retried by the next `clips(for:)` call.
    func prefetch(_ videoId: String) {
        guard memo[videoId] == nil, inFlight[videoId] == nil else { return }
        _ = start(videoId)
    }

    /// Drops the session copy so the next `clips(for:)` refetches. An
    /// in-flight request is kept and joined — it is already fresh.
    func invalidate(_ videoId: String) {
        memo[videoId] = nil
    }

    /// Unstructured on purpose: a caller that goes away (or a prefetch with
    /// no caller at all) must not cancel a fetch others are waiting on.
    /// The task does its own bookkeeping before it resolves, so by the time
    /// any awaiter resumes the in-flight slot is already clear.
    private func start(_ videoId: String) -> Task<[LessonClip], Error> {
        let task = Task { try await self.load(videoId) }
        inFlight[videoId] = task
        return task
    }

    private func load(_ videoId: String) async throws -> [LessonClip] {
        defer { inFlight[videoId] = nil }
        let clips = try await fetch(videoId)
        // Memoized before the disk write so callers arriving meanwhile
        // are served from memory.
        memo[videoId] = clips
        await cache?.save(clips, for: videoId)
        return clips
    }
}

/// `ClipCache` on `CacheService` (Caches directory, so iOS may purge it).
/// A week covers a learner who goes offline for a few days.
struct DiskClipCache: ClipCache {
    private let store: CacheService

    init(store: CacheService = .shared) {
        self.store = store
    }

    private static func key(_ videoId: String) -> String { "poc-clips:\(videoId)" }

    func load(_ videoId: String) async -> [LessonClip]? {
        await store.get([LessonClip].self, for: Self.key(videoId))
    }

    func save(_ clips: [LessonClip], for videoId: String) async {
        await store.set(clips, for: Self.key(videoId), ttl: CacheService.TTL.clipsOffline)
    }
}
