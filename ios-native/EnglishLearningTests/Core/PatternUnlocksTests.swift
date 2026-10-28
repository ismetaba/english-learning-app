import XCTest
@testable import EnglishLearning

/// The Spanish path opens step by step: a learner learns a pattern on
/// Kalıplar, then watches the scenes that use it, and its words join theirs.
final class PatternUnlocksTests: XCTestCase {
    private let path = ["ser-estar-adj-yo", "ser-estar-adj-tu", "es-quiero"]

    private func set(_ pattern: String, words: [String]) -> VideoSet {
        VideoSet(id: "pattern-\(pattern)", title: pattern, titleTr: nil, description: nil, descriptionTr: nil,
                 difficulty: nil, sortOrder: 0, videos: [], patternId: pattern, words: words)
    }

    func test_videoAndWordsOpenWithTheFirstPattern() {
        XCTAssertFalse(PatternUnlocks(path: path, completed: []).isOpen)
        XCTAssertFalse(PatternUnlocks(path: path, completed: ["be-adj-i"]).isOpen)
        XCTAssertTrue(PatternUnlocks(path: path, completed: ["ser-estar-adj-tu"]).isOpen)
    }

    /// One set per pattern done, in path order whatever order the server
    /// sends them in; the sets of patterns not done stay closed.
    func test_theSetsOfThePatternsDoneOpen() {
        let sets = [set("es-quiero", words: []), set("ser-estar-adj-yo", words: []), set("ser-estar-adj-tu", words: [])]
        let u = PatternUnlocks(path: path, completed: ["es-quiero", "ser-estar-adj-yo"])
        XCTAssertEqual(u.openSets(sets).map(\.patternId), ["ser-estar-adj-yo", "es-quiero"])
        XCTAssertEqual(u.next, "ser-estar-adj-tu")
    }

    func test_freeWatchingOpensWhenThePathIsDone() {
        XCTAssertFalse(PatternUnlocks(path: path, completed: ["ser-estar-adj-yo", "es-quiero"]).freeWatchOpen)
        XCTAssertTrue(PatternUnlocks(path: path, completed: Set(path)).freeWatchOpen)
        XCTAssertNil(PatternUnlocks(path: path, completed: Set(path)).next)
    }

    /// The words of the patterns done, in path order, each once.
    func test_thePatternsDoneBringTheirWords() {
        let sets = [set("ser-estar-adj-yo", words: ["a2-es-feliz", "a2-es-listo"]),
                    set("es-quiero", words: ["a2-es-querer", "a2-es-listo"]),
                    set("ser-estar-adj-tu", words: ["a2-es-lindo"])]
        let u = PatternUnlocks(path: path, completed: ["es-quiero", "ser-estar-adj-yo"])
        XCTAssertEqual(u.words(of: sets), ["a2-es-feliz", "a2-es-listo", "a2-es-querer"])
    }

    /// The server's pattern set decodes with its pattern, words and each
    /// scene's target lines; the speed sets decode as before.
    func test_patternSetDecodes() throws {
        let json = """
        [{"id": "pattern-es-quiero", "title": "Quiero", "title_tr": "Quiero", "description": null,
          "description_tr": "Hedef kalıp", "difficulty": null, "sort_order": 4, "pattern_id": "es-quiero",
          "words": ["a2-es-querer"],
          "videos": [{"id": "es-a", "youtube_video_id": "yt", "title": "t", "movie_title": "m", "difficulty": "beginner",
                      "wpm": 120, "a2_ratio": null, "avg_sentence_len": 4, "clip_count": 1, "total_lines": 10,
                      "tagged_lines": 10, "starter_words": [], "target_lines": 3}]}]
        """
        let s = try XCTUnwrap(JSONDecoder().decode([VideoSet].self, from: Data(json.utf8)).first)
        XCTAssertEqual(s.patternId, "es-quiero")
        XCTAssertEqual(s.words, ["a2-es-querer"])
        XCTAssertEqual(s.videos.first?.targetLines, 3)
        let speed = try XCTUnwrap(Fixture.decode([VideoSet].self, "es-video-sets.json").first)
        XCTAssertNil(speed.patternId)
        XCTAssertNil(speed.videos.first?.targetLines)
    }
}
