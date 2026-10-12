import XCTest
@testable import EnglishLearning

/// `UserProgress` is one JSON blob in UserDefaults. With synthesized Codable,
/// adding ANY field made every existing blob undecodable; `AppState` swallowed
/// the error with `try?` and the next write replaced the user's progress
/// with an empty one. These tests pin the 1.0.1 on-disk format.
final class ProgressPersistenceTests: XCTestCase {

    private func goldenObject() throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Fixture.data("user-progress-1.0.1.json")) as? [String: Any])
    }

    private func decode(_ object: Any) throws -> UserProgress {
        try JSONDecoder().decode(UserProgress.self, from: JSONSerialization.data(withJSONObject: object))
    }

    func test_decodesTheBlobWrittenByVersion1_0_1() throws {
        let p = try JSONDecoder().decode(UserProgress.self, from: Fixture.data("user-progress-1.0.1.json"))
        XCTAssertEqual(p.learnedWords, ["a2-make", "a2-life", "a2-try"])
        XCTAssertEqual(p.xp, 145)
        XCTAssertEqual(p.streak, 4)
        XCTAssertEqual(p.lastActiveDate, "2026-07-01")
        XCTAssertTrue(p.onboardingCompleted)
        XCTAssertEqual(p.onboardingLevel, .elementary)
        XCTAssertEqual(p.lessonMastery["lesson-01-greetings"]?.stage, .watch)
        XCTAssertEqual(p.sessionHistory.first?.minutesWatched, 12.5)
        XCTAssertEqual(p.watchedClips, ["18578"])
        XCTAssertEqual(p.watchedVideos, [], "field added after 1.0.1 defaults to empty")
    }

    func test_anySingleMissingKeyFallsBackToItsDefault() throws {
        let golden = try goldenObject()
        for key in golden.keys {
            var obj = golden
            obj.removeValue(forKey: key)
            let p = try decode(obj)      // must not throw
            XCTAssertEqual(p.learnedWords, key == "learnedWords" ? [] : ["a2-make", "a2-life", "a2-try"], "removed \(key)")
        }
        XCTAssertEqual(try decode([String: Any]()), UserProgress())
    }

    func test_nestedRecordsAreTolerantToo() throws {
        var obj = try goldenObject()
        var mastery = try XCTUnwrap(obj["lessonMastery"] as? [String: Any])
        var lesson = try XCTUnwrap(mastery["lesson-01-greetings"] as? [String: Any])
        lesson.removeValue(forKey: "errorSessionCount")
        lesson.removeValue(forKey: "subProgress")
        mastery["lesson-01-greetings"] = lesson
        obj["lessonMastery"] = mastery
        let p = try decode(obj)
        XCTAssertEqual(p.lessonMastery["lesson-01-greetings"]?.stage, .watch)
        XCTAssertEqual(p.xp, 145)
    }

    func test_unknownKeysAndUnknownEnumValuesDoNotWipeProgress() throws {
        var obj = try goldenObject()
        obj["someFutureField"] = ["x": 1]
        obj["onboardingLevel"] = "expert"        // case added in a later version
        let p = try decode(obj)
        XCTAssertEqual(p.xp, 145)
        XCTAssertEqual(p.onboardingLevel, .none)
    }

    func test_roundTripsIncludingNewFields() throws {
        var p = try JSONDecoder().decode(UserProgress.self, from: Fixture.data("user-progress-1.0.1.json"))
        p.watchedVideos = ["storks-wolves-love-babies"]
        let back = try JSONDecoder().decode(UserProgress.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(back, p)
    }

    func test_vocabPoolFrom1_0_1Decodes() throws {
        let pool = try JSONDecoder().decode([String: VocabPoolEntry].self, from: Fixture.data("vocab-pool-1.0.1.json"))
        XCTAssertEqual(pool["a2-make"]?.interval, 3)
    }

    // MARK: - Store: never overwrite what we couldn't read

    private func freshDefaults() -> UserDefaults {
        let name = "progress-tests-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    func test_storeLoadsAndSaves() throws {
        let d = freshDefaults()
        XCTAssertNil(ProgressPersistence.load(from: d))
        var p = UserProgress()
        p.xp = 9
        ProgressPersistence.save(p, to: d)
        XCTAssertEqual(ProgressPersistence.load(from: d)?.xp, 9)
    }

    func test_undecodableBlobIsBackedUpBeforeAnythingElse() throws {
        let d = freshDefaults()
        let corrupt = Data("{\"xp\": \"not a number\"".utf8)
        d.set(corrupt, forKey: ProgressPersistence.progressKey)

        XCTAssertNil(ProgressPersistence.load(from: d), "corrupt blob reads as no progress")
        let backups = d.dictionaryRepresentation().keys.filter { $0.hasPrefix(ProgressPersistence.backupKeyPrefix) }
        XCTAssertEqual(backups.count, 1, "the unreadable bytes are preserved under a backup key")
        let backupKey = try XCTUnwrap(backups.first)
        XCTAssertEqual(d.data(forKey: backupKey), corrupt)

        // A later save must not destroy the backup.
        ProgressPersistence.save(UserProgress(), to: d)
        XCTAssertEqual(d.data(forKey: backupKey), corrupt)
    }
}
