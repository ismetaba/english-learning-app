import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import EnglishLearning

/// Measured against production on 2026-10-12: `/poc-videos/{id}/clips`
/// took 4–33s and up to 750KB, and the app refetched it on every open with
/// a 40s resource timeout and no cache.
final class NetworkingTests: XCTestCase {

    // MARK: - Session / retry policy

    func test_sessionAllowsTheSlowClipsEndpoint() {
        let c = APIClient.makeSessionConfiguration()
        XCTAssertGreaterThanOrEqual(c.timeoutIntervalForRequest, 45)
        XCTAssertGreaterThanOrEqual(c.timeoutIntervalForResource, 90)
    }

    func test_retriesOnlyWhatCanSucceedOnRetry() {
        let timeout = APIError.transport(URLError(.timedOut))
        XCTAssertTrue(APIClient.shouldRetry(timeout, attempt: 0, maxRetries: 2))
        XCTAssertTrue(APIClient.shouldRetry(APIError.http(status: 503, url: "u"), attempt: 1, maxRetries: 2))
        XCTAssertFalse(APIClient.shouldRetry(timeout, attempt: 2, maxRetries: 2), "budget exhausted")
        XCTAssertFalse(APIClient.shouldRetry(APIError.http(status: 404, url: "u"), attempt: 0, maxRetries: 2))
        XCTAssertFalse(APIClient.shouldRetry(APIError.decoding(URLError(.cannotParseResponse)), attempt: 0, maxRetries: 2),
                       "decoding the same bytes again cannot succeed")
        XCTAssertFalse(APIClient.shouldRetry(APIError.transport(URLError(.cancelled)), attempt: 0, maxRetries: 2),
                       "a cancelled screen must not keep retrying")
        XCTAssertFalse(APIClient.shouldRetry(CancellationError(), attempt: 0, maxRetries: 2))
    }

    func test_backoffGrowsAndStaysBounded() {
        let d1 = APIClient.backoffDelay(attempt: 1)
        let d2 = APIClient.backoffDelay(attempt: 2)
        XCTAssertGreaterThan(d1, 0.2)
        XCTAssertLessThanOrEqual(d1, 2.0)
        XCTAssertGreaterThan(d2, d1 * 0.9)
        XCTAssertLessThanOrEqual(APIClient.backoffDelay(attempt: 10), 8.0)
    }

    func test_queryIsNeverEncodedIntoThePath() throws {
        let url = try XCTUnwrap(APIClient.makeURL(base: URL(string: "https://example.com")!,
                                                  path: "/api/v1/lessons/lesson-01/clips",
                                                  query: [URLQueryItem(name: "all", value: "true")]))
        XCTAssertEqual(url.absoluteString, "https://example.com/api/v1/lessons/lesson-01/clips?all=true")
    }

    // MARK: - Messages the learner sees

    func test_errorMessagesAreTurkishAndFreeOfTechnicalDetail() {
        let cases: [(APIError, String)] = [
            (.transport(URLError(.notConnectedToInternet)), "İnternet"),
            (.transport(URLError(.timedOut)), "zaman"),
            (.http(status: 500, url: "https://english-learning-admin.fly.dev/x"), "Sunucu"),
            (.decoding(URLError(.cannotParseResponse)), "İçerik"),
        ]
        for (error, needle) in cases {
            let text = error.localizedDescription
            XCTAssertTrue(text.localizedCaseInsensitiveContains(needle), "\(error): \(text)")
            XCTAssertFalse(text.contains("http"), "URL leaked: \(text)")
            XCTAssertFalse(text.contains("Error Domain"), "raw NSError leaked: \(text)")
        }
    }

    // MARK: - ClipStore

    private actor Counter {
        var calls: [String] = []
        func record(_ id: String) { calls.append(id) }
    }

    private actor MemoryCache: ClipCache {
        var store: [String: [LessonClip]] = [:]
        func load(_ videoId: String) async -> [LessonClip]? { store[videoId] }
        func save(_ clips: [LessonClip], for videoId: String) async { store[videoId] = clips }
    }

    private struct Boom: Error {}

    private func sampleClips() throws -> [LessonClip] {
        [try Fixture.clip("storks")]
    }

    func test_concurrentRequestsForOneVideoShareOneFetch() async throws {
        let counter = Counter()
        let clips = try sampleClips()
        let store = ClipStore(fetch: { id in
            await counter.record(id)
            try await Task.sleep(nanoseconds: 50_000_000)
            return clips
        })
        async let a = store.clips(for: "storks")
        async let b = store.clips(for: "storks")
        let (ra, rb) = try await (a, b)
        XCTAssertEqual(ra, clips)
        XCTAssertEqual(rb, clips)
        let calls = await counter.calls
        XCTAssertEqual(calls, ["storks"])
    }

    func test_prefetchMakesTheNextVideoInstant() async throws {
        let counter = Counter()
        let clips = try sampleClips()
        let store = ClipStore(fetch: { id in
            await counter.record(id)
            return clips
        })
        await store.prefetch("next-video")
        try await Task.sleep(nanoseconds: 50_000_000)
        _ = try await store.clips(for: "next-video")
        _ = try await store.clips(for: "next-video")
        let calls = await counter.calls
        XCTAssertEqual(calls, ["next-video"])
    }

    func test_failedFetchFallsBackToTheLastGoodCopy() async throws {
        let cache = MemoryCache()
        let clips = try sampleClips()
        await cache.save(clips, for: "storks")
        let store = ClipStore(fetch: { _ in throw Boom() }, cache: cache)
        let got = try await store.clips(for: "storks")
        XCTAssertEqual(got, clips)
    }

    func test_failuresAreNotMemoized() async throws {
        let counter = Counter()
        let clips = try sampleClips()
        let store = ClipStore(fetch: { id in
            await counter.record(id)
            if await counter.calls.count == 1 { throw Boom() }
            return clips
        })
        do { _ = try await store.clips(for: "v"); XCTFail("first call should fail") } catch {}
        let second = try await store.clips(for: "v")
        XCTAssertEqual(second, clips)
    }

    /// Production takes up to 60s before the first byte for some videos.
    /// A video opened in an earlier session must start from its saved copy
    /// at once, with the network copy replacing it in the background.
    func test_savedCopyIsServedImmediatelyAndRefreshedInTheBackground() async throws {
        let cache = MemoryCache()
        let old = try sampleClips()
        let fresh = [try Fixture.clip("frozen")]
        await cache.save(old, for: "v")
        let store = ClipStore(fetch: { _ in
            try await Task.sleep(nanoseconds: 300_000_000)   // slow server
            return fresh
        }, cache: cache)

        let started = Date()
        let first = try await store.clips(for: "v")
        XCTAssertEqual(first, old)
        XCTAssertLessThan(Date().timeIntervalSince(started), 0.2, "waited for the network despite a saved copy")

        try await Task.sleep(nanoseconds: 600_000_000)
        let second = try await store.clips(for: "v")
        XCTAssertEqual(second, fresh, "background refresh should replace the saved copy for this session")
        let saved = await cache.load("v")
        XCTAssertEqual(saved, fresh)
    }

    func test_explicitRefreshWaitsForTheNetwork() async throws {
        let cache = MemoryCache()
        let old = try sampleClips()
        let fresh = [try Fixture.clip("frozen")]
        await cache.save(old, for: "v")
        let store = ClipStore(fetch: { _ in fresh }, cache: cache)
        let got = try await store.clips(for: "v", preferSaved: false)
        XCTAssertEqual(got, fresh, "pull-to-refresh must not answer with the saved copy")
    }

    func test_successfulFetchIsWrittenToTheCache() async throws {
        let cache = MemoryCache()
        let clips = try sampleClips()
        let store = ClipStore(fetch: { _ in clips }, cache: cache)
        _ = try await store.clips(for: "storks")
        let saved = await cache.load("storks")
        XCTAssertEqual(saved, clips)
    }
}
