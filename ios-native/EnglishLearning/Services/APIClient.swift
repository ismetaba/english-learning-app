import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum APIError: LocalizedError, CustomDebugStringConvertible {
    case invalidURL
    case http(status: Int, url: String)
    case decoding(Error)
    case transport(Error)

    /// Shown verbatim to Turkish learners, so it stays short, actionable
    /// and free of URLs / NSError dumps. Technical detail lives in
    /// `debugDescription` for logs.
    var errorDescription: String? {
        switch self {
        case .invalidURL, .decoding:
            return "İçerik yüklenemedi. Tekrar dene."
        case .http(let status, _):
            switch status {
            case 408: return "Sunucu zamanında yanıt vermedi. Tekrar dene."
            case 429: return "Sunucu şu an çok yoğun. Biraz sonra tekrar dene."
            case 400..<500: return "İçerik bulunamadı."
            case 500...: return "Sunucu şu an yanıt vermiyor. Biraz sonra tekrar dene."
            default: return "Bağlantı kurulamadı. Tekrar dene."
            }
        case .transport(let error):
            switch Self.urlErrorCode(error) {
            case .notConnectedToInternet?, .networkConnectionLost?, .dataNotAllowed?,
                 .internationalRoamingOff?, .callIsActive?, .cannotFindHost?, .dnsLookupFailed?:
                return "İnternet bağlantını kontrol et ve tekrar dene."
            case .timedOut?:
                return "Sunucu zamanında yanıt vermedi. Tekrar dene."
            default:
                return "Bağlantı kurulamadı. Tekrar dene."
            }
        }
    }

    var debugDescription: String {
        switch self {
        case .invalidURL: return "APIError.invalidURL"
        case .http(let s, let u): return "APIError.http(\(s)) at \(u)"
        case .decoding(let e): return "APIError.decoding: \(e)"
        case .transport(let e): return "APIError.transport: \(e)"
        }
    }

    /// `URLError` code whether the error arrives typed or as a bridged
    /// `NSError` (URLSession hands back either depending on platform).
    static func urlErrorCode(_ error: Error) -> URLError.Code? {
        if let urlError = error as? URLError { return urlError.code }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain ? URLError.Code(rawValue: ns.code) : nil
    }
}

/// Minimal, dependency-free API client talking to the admin backend.
actor APIClient {
    static let shared = APIClient()

    private let base: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init() {
        // Default to the deployed admin on fly.dev for ALL builds —
        // both simulator and physical-device DEBUG hit production now.
        // The set + structure + per-word TR pipeline lives on the
        // remote DB so a phone on cellular can use the app without
        // needing the Mac running. Set `ADMIN_API_BASE_URL` (env var
        // for simulator, Info.plist for the device) to override —
        // useful when iterating on local backend changes.
        let envBase = ProcessInfo.processInfo.environment["ADMIN_API_BASE_URL"]
        let plistBase = Bundle.main.object(forInfoDictionaryKey: "ADMIN_API_BASE_URL") as? String
        let defaultBase = "https://english-learning-admin.fly.dev"
        let baseString = envBase ?? plistBase ?? defaultBase
        self.base = URL(string: baseString)!

        self.session = URLSession(configuration: Self.makeSessionConfiguration())
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

    func fetchStarterWordContexts(id: String) async throws -> StarterWordContexts {
        try await get("/api/v1/starter-words/\(id)/contexts")
    }

    func fetchStarterWordSummaries(ids: [String]) async throws -> [StarterWordSummary] {
        guard !ids.isEmpty else { return [] }
        return try await get(
            "/api/v1/starter-words",
            query: [URLQueryItem(name: "ids", value: ids.joined(separator: ","))],
        )
    }

    func fetchVocabFeed(poolIds: [String], includeDiscovery: Bool = true, limit: Int = 80) async throws -> VocabFeedResponse {
        var query: [URLQueryItem] = []
        if !poolIds.isEmpty {
            query.append(URLQueryItem(name: "ids", value: poolIds.joined(separator: ",")))
        }
        query.append(URLQueryItem(name: "discovery", value: includeDiscovery ? "1" : "0"))
        query.append(URLQueryItem(name: "limit", value: String(limit)))
        return try await get("/api/v1/vocab-feed", query: query)
    }

    /// Returns up to `limit` movie-clip scenes that open with the given
    /// pattern (e.g. "be-adj-i" → sentences starting with "I am"). The
    /// shape mirrors the Word Reels feed so the same karaoke card can
    /// render it.
    func fetchPatternScenes(patternId: String, limit: Int = 100) async throws -> PatternScenesResponse {
        let query = [URLQueryItem(name: "limit", value: String(limit))]
        return try await get("/api/v1/patterns/\(patternId)/scenes", query: query)
    }

    // MARK: - Curriculum

    func fetchCurriculum() async throws -> [CurriculumUnit] {
        try await get("/api/v1/curriculum")
    }

    func fetchLesson(lessonId: String) async throws -> LessonDetail {
        try await get("/api/v1/lessons/\(lessonId)")
    }

    func fetchLessonClips(lessonId: String, all: Bool = false) async throws -> [LessonClip] {
        // A query item, not "?all=true" in the path — that got
        // percent-encoded to `%3F` and 404'd.
        let query = all ? [URLQueryItem(name: "all", value: "true")] : []
        return try await get("/api/v1/lessons/\(lessonId)/clips", query: query)
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

    // MARK: - Policy

    /// `/poc-videos/{id}/clips` takes 4–33s and up to 750KB in production,
    /// so the old 20s/40s limits failed real responses mid-download.
    /// `waitsForConnectivity` stays off: offline must fail at once so the
    /// retry loop and ClipStore's last-good copy kick in, instead of each
    /// attempt silently waiting out the full resource timeout.
    static func makeSessionConfiguration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        #if !os(Linux)
        config.waitsForConnectivity = false
        #endif
        return config
    }

    /// Retry only what a second attempt can fix: transport hiccups, 5xx,
    /// 408 and 429. Cancellation (the screen went away), 4xx, bad URLs and
    /// undecodable bodies fail the same way every time.
    static func shouldRetry(_ error: Error, attempt: Int, maxRetries: Int) -> Bool {
        guard attempt < maxRetries else { return false }
        switch error {
        case is CancellationError:
            return false
        case APIError.invalidURL, APIError.decoding:
            return false
        case APIError.http(let status, _):
            return !(400..<500).contains(status) || status == 408 || status == 429
        case APIError.transport(let underlying):
            return !isCancellation(underlying)
        default:
            return !isCancellation(error)
        }
    }

    private static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || APIError.urlErrorCode(error) == .cancelled
    }

    /// Exponential from ~0.6s, capped at 8s, with up to +25% jitter so
    /// clients knocked offline together don't retry in lockstep.
    static func backoffDelay(attempt: Int) -> TimeInterval {
        let exponential = 0.6 * pow(2, Double(max(attempt, 1) - 1))
        return min(exponential * Double.random(in: 1...1.25), 8)
    }

    static func makeURL(base: URL, path: String, query: [URLQueryItem]) -> URL? {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        return components?.url
    }

    // MARK: - Core request

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        guard let url = Self.makeURL(base: base, path: path, query: query) else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("EnglishLearning-iOS/1.0", forHTTPHeaderField: "User-Agent")

        let data = try await withRetry(maxRetries: 2) { try await self.send(request) }
        // Decoded once, outside the retry loop: the same bytes would fail again.
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let cancelled as CancellationError {
            throw cancelled
        } catch {
            throw APIError.transport(error)
        }
        let url = request.url?.absoluteString ?? ""
        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(status: -1, url: url)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, url: url)
        }
        return data
    }

    /// Cancellation must propagate: a dismissed screen stops between
    /// attempts and during backoff instead of retrying in the background.
    private func withRetry<T>(maxRetries: Int, _ block: () async throws -> T) async throws -> T {
        var attempt = 0
        while true {
            try Task.checkCancellation()
            do {
                return try await block()
            } catch {
                guard Self.shouldRetry(error, attempt: attempt, maxRetries: maxRetries) else { throw error }
                attempt += 1
                try await Task.sleep(nanoseconds: UInt64(Self.backoffDelay(attempt: attempt) * 1_000_000_000))
            }
        }
    }
}
