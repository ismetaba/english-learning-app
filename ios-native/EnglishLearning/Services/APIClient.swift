import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case http(status: Int, url: String)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .http(let s, let u): return "HTTP \(s) at \(u)"
        case .decoding(let e): return "Decoding failed: \(e)"
        case .transport(let e): return "Network error: \(e.localizedDescription)"
        }
    }
}

/// Minimal, dependency-free API client talking to the admin backend.
actor APIClient {
    static let shared = APIClient()

    private let base: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init() {
        // DEBUG: hit the Mac running `npm run dev` from admin/. Simulator
        // shares the host's loopback so localhost works there. A physical
        // device on the same Wi-Fi needs the Mac's LAN IP — update the
        // device-side default below if your IP changes, or set
        // ADMIN_API_BASE_URL via the env / Info.plist to override.
        // Release: always fly.dev.
        #if DEBUG
        let envBase = ProcessInfo.processInfo.environment["ADMIN_API_BASE_URL"]
        let plistBase = Bundle.main.object(forInfoDictionaryKey: "ADMIN_API_BASE_URL") as? String
        #if targetEnvironment(simulator)
        let defaultBase = "http://localhost:3000"
        #else
        let defaultBase = "http://192.168.1.110:3000"
        #endif
        let baseString = envBase ?? plistBase ?? defaultBase
        #else
        let baseString = "https://english-learning-admin.fly.dev"
        #endif
        self.base = URL(string: baseString)!

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 40
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    // MARK: - POC videos (Feynman video-first)

    func fetchPocVideos() async throws -> [PocVideo] {
        try await get("/api/v1/poc-videos")
    }

    func fetchPocVideoClips(videoId: String) async throws -> [LessonClip] {
        try await get("/api/v1/poc-videos/\(videoId)/clips")
    }

    func fetchVideoSets() async throws -> [VideoSet] {
        try await get("/api/v1/video-sets")
    }

    // MARK: - Curriculum

    func fetchCurriculum() async throws -> [CurriculumUnit] {
        try await get("/api/v1/curriculum")
    }

    func fetchLesson(lessonId: String) async throws -> LessonDetail {
        try await get("/api/v1/lessons/\(lessonId)")
    }

    func fetchLessonClips(lessonId: String, all: Bool = false) async throws -> [LessonClip] {
        try await get("/api/v1/lessons/\(lessonId)/clips" + (all ? "?all=true" : ""))
    }

    func fetchLessonClipsPaginated(lessonId: String,
                                   page: Int = 1,
                                   perPage: Int = 10,
                                   exclude: [String] = []) async throws -> PaginatedClips {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(perPage))
        ]
        if !exclude.isEmpty {
            items.append(URLQueryItem(name: "exclude", value: exclude.joined(separator: ",")))
        }
        return try await get("/api/v1/lessons/\(lessonId)/clips", query: items)
    }

    // MARK: - Vocab

    func fetchVocabSets() async throws -> [VocabSet] {
        try await get("/api/v1/vocab/sets")
    }

    func fetchVocabSet(id: String) async throws -> VocabSetWithWords {
        try await get("/api/v1/vocab/sets/\(id)")
    }

    // MARK: - Clips by structure/vocab

    func fetchClipsByStructure(lessonId: String) async throws -> [LessonClip] {
        try await get("/api/v1/clips/by-structure/\(lessonId)")
    }

    func fetchClipsByVocab(wordId: String) async throws -> [LessonClip] {
        try await get("/api/v1/clips/by-vocab/\(wordId)")
    }

    // MARK: - Core request

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query
        }
        guard let url = components?.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("EnglishLearning-iOS/1.0", forHTTPHeaderField: "User-Agent")

        return try await withRetry(maxRetries: 2) {
            do {
                let (data, response) = try await self.session.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw APIError.http(status: -1, url: url.absoluteString)
                }
                guard (200..<300).contains(http.statusCode) else {
                    throw APIError.http(status: http.statusCode, url: url.absoluteString)
                }
                do {
                    return try self.decoder.decode(T.self, from: data)
                } catch {
                    throw APIError.decoding(error)
                }
            } catch let err as APIError {
                throw err
            } catch {
                throw APIError.transport(error)
            }
        }
    }

    private func withRetry<T>(maxRetries: Int, _ block: () async throws -> T) async throws -> T {
        var attempt = 0
        while true {
            do { return try await block() }
            catch {
                if case APIError.http(let status, _) = error, (400..<500).contains(status) {
                    throw error
                }
                if attempt >= maxRetries { throw error }
                attempt += 1
                let delay = UInt64(Double(attempt) * 1_000_000_000) // 1s, 2s
                try? await Task.sleep(nanoseconds: delay)
            }
        }
    }
}
