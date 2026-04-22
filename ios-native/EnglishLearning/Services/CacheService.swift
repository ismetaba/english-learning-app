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
