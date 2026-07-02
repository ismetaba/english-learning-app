import Foundation

/// On-disk JSON cache with TTL, mirroring the RN app's cacheService.
actor CacheService {
    static let shared = CacheService()

    enum TTL {
        static let curriculum: TimeInterval = 60 * 60 * 24       // 24h
        static let lesson: TimeInterval     = 60 * 60            // 1h
        static let clips: TimeInterval      = 60 * 30            // 30m
        static let vocab: TimeInterval      = 60 * 60 * 24       // 24h
    }

    private let directory: URL

    init() {
        let fm = FileManager.default
        let base = (try? fm.url(
            for: .cachesDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )) ?? fm.temporaryDirectory
        directory = base.appendingPathComponent("EnglishLearningCache", isDirectory: true)
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private struct Envelope<T: Codable>: Codable {
        let expiresAt: Date
        let data: T
    }

    private func url(for key: String) -> URL {
        let sanitized = key.replacingOccurrences(of: "/", with: "_")
        return directory.appendingPathComponent(sanitized + ".cache.json")
    }

    func get<T: Codable>(_ type: T.Type, for key: String) async -> T? {
        let file = url(for: key)
        guard let data = try? Data(contentsOf: file) else { return nil }
        guard let env = try? JSONDecoder().decode(Envelope<T>.self, from: data) else { return nil }
        if env.expiresAt < Date() {
            try? FileManager.default.removeItem(at: file)
            return nil
        }
        return env.data
    }

    func set<T: Codable>(_ value: T, for key: String, ttl: TimeInterval) async {
        let env = Envelope(expiresAt: Date().addingTimeInterval(ttl), data: value)
        guard let data = try? JSONEncoder().encode(env) else { return }
        try? data.write(to: url(for: key), options: .atomic)
    }

    func clearAll() async {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}

/// High-level repo that composes APIClient + CacheService.
actor CurriculumRepository {
    static let shared = CurriculumRepository()

    // MARK: - POC videos (Feynman)

    func pocVideos(forceRefresh: Bool = false) async throws -> [PocVideo] {
        // No caching — POC list changes during dev (we swap which video is
        // active) and a stale cache hides those swaps. Pull-to-refresh
        // shouldn't be a prerequisite to see the latest set.
        try await APIClient.shared.fetchPocVideos()
    }

    func pocVideoClips(videoId: String, forceRefresh: Bool = false) async throws -> [LessonClip] {
        // No caching — structure tagging is still landing while we build, so
        // the response shape can change on every refresh during Phase 1.
        try await APIClient.shared.fetchPocVideoClips(videoId: videoId)
    }

    func videoSets(forceRefresh: Bool = false) async throws -> [VideoSet] {
        // No caching for the same reason as pocVideos — set composition
        // is being curated live, stale cache hides the latest layout.
        try await APIClient.shared.fetchVideoSets()
    }

    func starterWordContexts(id: String, forceRefresh: Bool = false) async throws -> StarterWordContexts {
        // 24h cache — context list for a given starter only changes
        // when the corpus is re-tagged, which is rare. Pull-to-refresh
        // on the detail screen forces a fresh fetch.
        let key = "starter-contexts:\(id)"
        if !forceRefresh,
           let cached = await CacheService.shared.get(StarterWordContexts.self, for: key) {
            return cached
        }
        let data = try await APIClient.shared.fetchStarterWordContexts(id: id)
        await CacheService.shared.set(data, for: key, ttl: 60 * 60 * 24)
        return data
    }

    func starterWordSummaries(ids: [String], forceRefresh: Bool = false) async throws -> [StarterWordSummary] {
        // No caching — `ids` varies per call (whatever the user has in
        // their pool right now), and the underlying counts can shift
        // when the corpus is updated; safer to refetch.
        try await APIClient.shared.fetchStarterWordSummaries(ids: ids)
    }

    func vocabFeed(poolIds: [String], includeDiscovery: Bool = true, limit: Int = 80) async throws -> VocabFeedResponse {
        // Never cache — the feed is intentionally re-shuffled on every
        // pull, so each visit feels fresh. Also lets the user pull
        // down to swap the rotation.
        try await APIClient.shared.fetchVocabFeed(
            poolIds: poolIds,
            includeDiscovery: includeDiscovery,
            limit: limit,
        )
    }

    func patternScenes(patternId: String, limit: Int = 100) async throws -> PatternScenesResponse {
        // Same reasoning as vocabFeed — server reshuffles per request,
        // pull-to-refresh swaps rotation. Stale cache would defeat that.
        try await APIClient.shared.fetchPatternScenes(patternId: patternId, limit: limit)
    }

    func curriculum(forceRefresh: Bool = false) async throws -> [CurriculumUnit] {
        let key = "curriculum"
        if !forceRefresh, let cached = await CacheService.shared.get([CurriculumUnit].self, for: key) {
            return cached
        }
        let data = try await APIClient.shared.fetchCurriculum()
        await CacheService.shared.set(data, for: key, ttl: CacheService.TTL.curriculum)
        return data
    }

    func lesson(id: String) async throws -> LessonDetail {
        let key = "lesson:\(id)"
        if let cached = await CacheService.shared.get(LessonDetail.self, for: key) {
            return cached
        }
        let detail = try await APIClient.shared.fetchLesson(lessonId: id)
        await CacheService.shared.set(detail, for: key, ttl: CacheService.TTL.lesson)
        return detail
    }

    func clips(lessonId: String) async throws -> [LessonClip] {
        // Server rotates 10 random — skip caching
        try await APIClient.shared.fetchLessonClips(lessonId: lessonId)
    }

    func allClips(lessonId: String) async throws -> [LessonClip] {
        let key = "clips:all:\(lessonId)"
        if let cached = await CacheService.shared.get([LessonClip].self, for: key) {
            return cached
        }
        let data = try await APIClient.shared.fetchLessonClips(lessonId: lessonId, all: true)
        await CacheService.shared.set(data, for: key, ttl: CacheService.TTL.clips)
        return data
    }

    func paginatedClips(lessonId: String, page: Int, perPage: Int, exclude: [String] = []) async throws -> PaginatedClips {
        try await APIClient.shared.fetchLessonClipsPaginated(
            lessonId: lessonId, page: page, perPage: perPage, exclude: exclude
        )
    }
}
