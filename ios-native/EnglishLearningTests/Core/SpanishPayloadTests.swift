import XCTest
@testable import EnglishLearning

/// Real responses of the Spanish server (english-learning-es.fly.dev),
/// captured on 2026-10-27, decoded with the app's models. Its content is
/// built by a different pipeline than the English corpus, so fields the
/// English data always fills can come back null here (the speaker did,
/// and every Spanish scene failed to load).
final class SpanishPayloadTests: XCTestCase {

    func test_videoSetsDecode() throws {
        let sets = try Fixture.decode([VideoSet].self, "es-video-sets.json")
        XCTAssertEqual(sets.map(\.id), ["es-set-1"])
        XCTAssertTrue(sets[0].videos.allSatisfy { LearningLanguage.of(videoId: $0.id) == .es })
    }

    func test_clipDecodesWithWordGlosses() throws {
        let clip = try XCTUnwrap(Fixture.decode([LessonClip].self, "es-clip-mercado-mexicano-1.json").first)
        XCTAssertFalse(clip.lines.isEmpty)
        XCTAssertTrue(clip.lines.allSatisfy { $0.speaker.isEmpty && $0.translationTr != nil })
        XCTAssertTrue(clip.lines.flatMap(\.words).contains { $0.translationTr != nil })
    }

    func test_feedsDecode() throws {
        let feed = try Fixture.decode(VocabFeedResponse.self, "es-vocab-feed.json")
        XCTAssertFalse(feed.items.isEmpty)
        let scenes = try Fixture.decode(PatternScenesResponse.self, "es-pattern-scenes-ser-estar-adj-el.json")
        XCTAssertFalse(scenes.items.isEmpty)
    }

    func test_starterWordsDecode() throws {
        let contexts = try Fixture.decode(StarterWordContexts.self, "es-starter-contexts-a2-es-agua.json")
        XCTAssertFalse(contexts.contexts.isEmpty)
        let summaries = try Fixture.decode([StarterWordSummary].self, "es-starter-words.json")
        XCTAssertEqual(summaries.map(\.id), ["a2-es-gustar", "a2-es-agua"])
    }
}

/// The set card's mosaic shows four thumbnails. A set cut from long
/// sources lists runs of scenes from one YouTube video, which share a
/// thumbnail: the Spanish set showed the same image four times.
final class ThumbnailMosaicTests: XCTestCase {

    func test_reproduces_mosaicSkipsScenesOfTheSameVideo() throws {
        let set = try XCTUnwrap(Fixture.decode([VideoSet].self, "es-video-sets.json").first)
        let ids = set.mosaicVideos.map(\.youtubeVideoId)
        XCTAssertEqual(ids.count, 4)
        XCTAssertEqual(Set(ids).count, 4, "four different thumbnails")
    }

    /// Sets whose first videos already differ show exactly what they did.
    func test_distinctSetsAreUnchanged() throws {
        let set = try XCTUnwrap(Fixture.decode([VideoSet].self, "es-video-sets.json").first)
        let distinct = Dictionary(grouping: set.videos, by: \.youtubeVideoId).values.compactMap(\.first)
        let mixed = VideoSet(id: "x", title: "x", titleTr: nil, description: nil, descriptionTr: nil,
                             difficulty: nil, sortOrder: 0, videos: Array(distinct.prefix(6)))
        XCTAssertEqual(mixed.mosaicVideos.map(\.id), Array(distinct.prefix(4)).map(\.id))
    }
}

/// Spanish clip lines name the patterns they hold; the player marks a line
/// with one the learner has finished. English lines have no such field.
final class ClipLinePatternTests: XCTestCase {

    private func line(_ extra: String) throws -> ClipLine {
        let json = """
        {"id": 7, "text": "Tengo que irme.", "startTime": 1, "endTime": 2,
         "words": [{"word": "Tengo", "startTime": 1, "endTime": 1.4, "wordIndex": 0}]\(extra)}
        """
        return try JSONDecoder().decode(ClipLine.self, from: Data(json.utf8))
    }

    func test_marksTheFirstFinishedPattern() throws {
        let l = try line(#", "patternIds": ["es-tengo", "es-tengo-que"]"#)
        XCTAssertEqual(l.patternIds, ["es-tengo", "es-tengo-que"])
        XCTAssertEqual(l.finishedPatternId(completed: ["es-tengo-que", "es-hay"]), "es-tengo-que")
        XCTAssertNil(l.finishedPatternId(completed: ["es-hay"]))
    }

    /// The player shows lines as `ClipTiming.sanitize` rebuilt them.
    func test_sanitizedLinesKeepTheirPatterns() throws {
        let l = try line(#", "patternIds": ["es-tengo-que"]"#)
        XCTAssertEqual(ClipTiming.sanitize(l).patternIds, ["es-tengo-que"])
    }

    /// In a pattern set the set's own pattern is the target: marked even
    /// where the line also has an earlier finished one, which is marked
    /// plainly elsewhere.
    func test_theSetsPatternIsTheTarget() throws {
        let l = try line(#", "patternIds": ["ser-estar-adj-yo", "es-quiero"]"#)
        let done: Set<String> = ["ser-estar-adj-yo", "es-quiero"]
        XCTAssertEqual(l.markedPattern(focus: "es-quiero", completed: done)?.id, "es-quiero")
        XCTAssertEqual(l.markedPattern(focus: "es-quiero", completed: done)?.isFocus, true)
        XCTAssertEqual(l.markedPattern(focus: "es-hay", completed: done)?.id, "ser-estar-adj-yo")
        XCTAssertEqual(l.markedPattern(focus: "es-hay", completed: done)?.isFocus, false)
        XCTAssertNil(l.markedPattern(focus: nil, completed: []))
    }

    func test_linesWithoutPatternsDecode() throws {
        let l = try line("")
        XCTAssertNil(l.patternIds)
        XCTAssertNil(l.finishedPatternId(completed: ["es-tengo-que"]))
    }
}
