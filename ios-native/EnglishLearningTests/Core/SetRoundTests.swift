import XCTest
@testable import EnglishLearning

/// A pattern set is watched in rounds: a scene the learner has watched, in
/// this set or another, isn't played again until every scene of the set is
/// watched; then the set starts over and its scenes count as unwatched.
/// The speed sets play straight through, as before.
final class SetRoundTests: XCTestCase {

    private func video(_ id: String) -> PocVideo {
        PocVideo(id: id, youtubeVideoId: "yt-\(id)", title: id, movieTitle: "Película", difficulty: "beginner",
                 wpm: nil, a2Ratio: nil, avgSentenceLen: nil, clipCount: 1, totalLines: 10, taggedLines: 10,
                 starterWords: [])
    }

    private func set(_ id: String, _ videos: [String], pattern: String? = nil) -> VideoSet {
        VideoSet(id: id, title: id, titleTr: nil, description: nil, descriptionTr: nil, difficulty: nil,
                 sortOrder: 0, videos: videos.map(video), patternId: pattern)
    }

    private lazy var quiero = set("pattern-es-quiero", ["a", "b", "c", "d"], pattern: "es-quiero")
    private lazy var tengo = set("pattern-es-tengo", ["b", "c", "e"], pattern: "es-tengo")

    /// "b" was watched in another set: the run plays a, c, d.
    func test_aSceneWatchedElsewhereIsSkipped() {
        var p = UserProgress()
        p.recordVideoWatched("b")
        let round = SetRound(set: quiero, progress: p)
        XCTAssertEqual(round.watchedCount, 1)
        XCTAssertTrue(round.isWatched("b"))
        XCTAssertEqual(round.nextUnwatched, 0)
        XCTAssertEqual(round.next(after: 0), 2)
        XCTAssertEqual(round.next(after: 2), 3)
        XCTAssertNil(round.next(after: 3))
        XCTAssertFalse(round.startsOver)
    }

    /// Picked up in the middle: on to the next scene not watched yet, never
    /// back to one watched.
    func test_theRunGoesOnToTheNextUnwatchedScene() {
        var p = UserProgress()
        for id in ["a", "c"] { p.recordVideoWatched(id) }
        let round = SetRound(set: quiero, progress: p)
        XCTAssertEqual(round.nextUnwatched, 1)
        XCTAssertEqual(round.next(after: 1), 3)
    }

    /// Every scene watched: starting the set again starts it over, and its
    /// scenes count as unwatched in it, while other sets keep theirs.
    func test_onceEverySceneIsWatchedTheSetStartsOver() {
        var p = UserProgress()
        for id in ["a", "b", "c", "d"] { p.recordVideoWatched(id) }
        let done = SetRound(set: quiero, progress: p)
        XCTAssertTrue(done.isComplete)
        XCTAssertNil(done.nextUnwatched)
        XCTAssertTrue(done.startsOver)

        p.startNewRound(of: quiero.id)
        let fresh = SetRound(set: quiero, progress: p)
        XCTAssertEqual(fresh.watchedCount, 0)
        XCTAssertFalse(fresh.isComplete)
        XCTAssertEqual(fresh.nextUnwatched, 0)
        XCTAssertEqual(fresh.next(after: 0), 1)
        XCTAssertEqual(SetRound(set: tengo, progress: p).watchedCount, 2, "b and c stay watched in the other set")
        XCTAssertEqual(p.watchedVideos, ["a", "b", "c", "d"], "the learner's watched videos are kept")
    }

    /// In the new round a scene counts once it is watched again, here or in
    /// another set.
    func test_scenesWatchedAfterTheSetStartedOverCountInTheNewRound() {
        var p = UserProgress()
        for id in ["a", "b", "c", "d"] { p.recordVideoWatched(id) }
        p.startNewRound(of: quiero.id)
        p.recordVideoWatched("a")
        p.recordVideoWatched("c")   // watched in "Tengo"
        let round = SetRound(set: quiero, progress: p)
        XCTAssertEqual(round.watchedCount, 2)
        XCTAssertEqual(round.nextUnwatched, 1)
        XCTAssertEqual(round.next(after: 1), 3)
    }

    /// Videos watched before this build have no watch number: they count in
    /// a set's first round, and not after it starts over.
    func test_videosWatchedBeforeThisBuildCountInTheFirstRound() {
        var p = UserProgress()
        p.watchedVideos = ["a", "b", "c", "d"]
        XCTAssertTrue(SetRound(set: quiero, progress: p).startsOver)
        p.startNewRound(of: quiero.id)
        XCTAssertEqual(SetRound(set: quiero, progress: p).watchedCount, 0)
    }

    /// A speed set plays every video in order and never starts over.
    func test_speedSetsPlayStraightThrough() {
        let speed = set("es-set-1", ["a", "b", "c"])
        var p = UserProgress()
        p.recordVideoWatched("b")
        let round = SetRound(set: speed, progress: p)
        XCTAssertEqual(round.watchedCount, 1)
        XCTAssertEqual(round.next(after: 0), 1)
        XCTAssertNil(round.next(after: 2))
        for id in ["a", "c"] { p.recordVideoWatched(id) }
        XCTAssertFalse(SetRound(set: speed, progress: p).startsOver)
    }

    /// The round's records are part of the saved progress.
    func test_roundsSurviveSaving() throws {
        var p = UserProgress()
        for id in ["a", "b", "c", "d"] { p.recordVideoWatched(id) }
        p.startNewRound(of: quiero.id)
        p.recordVideoWatched("a")
        let back = try JSONDecoder().decode(UserProgress.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(back, p)
        XCTAssertEqual(SetRound(set: quiero, progress: back).watchedCount, 1)
    }
}
