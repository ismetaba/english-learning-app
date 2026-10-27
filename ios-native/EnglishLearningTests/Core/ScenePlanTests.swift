import XCTest
@testable import EnglishLearning

/// "Sahne" on a word reel / word detail opens the scene the sentence came
/// from. It used to start the YouTube video at the scene start (often 0s)
/// with only the one tapped sentence as subtitles — the learner stared at
/// "Listening…" for minutes (107s for the Coco sample) before their
/// sentence came up.
final class ScenePlanTests: XCTestCase {

    private func storksContext() throws -> VocabContext {
        let feed = try Fixture.decode(PatternScenesResponse.self, "pattern-scenes-be-adj-i.json")
        return try XCTUnwrap(feed.items.first { $0.videoId == "storks-wolves-love-babies" })
    }

    func test_reproduces_contextClipStartsFarBeforeTheSentence() throws {
        let feed = try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json")
        let worst = feed.items.map { $0.context.startTime - $0.context.asLessonClip().startTime }.max() ?? 0
        XCTAssertGreaterThan(worst, 60, "fixture should contain a sentence deep inside its scene")
    }

    /// …and then it ran on to the end of the scene, a minute or more past
    /// the sentence the learner tapped. A word's scene now stays with its
    /// sentence: the sentence and the couple of lines that answer it.
    func test_reproduces_sceneRanFarPastTheSentence() throws {
        let context = try storksContext()
        let fullClip = try Fixture.clip("storks")
        let sceneEnd = ClipTiming.playbackWindow(for: ClipTiming.sanitize(fullClip)).end
        XCTAssertGreaterThan(sceneEnd - context.endTime, 20, "fixture: the scene runs on well past the sentence")

        let plan = ScenePlan.make(context: context, videoClips: [fullClip])
        let window = ClipTiming.playbackWindow(for: plan.clip)
        XCTAssertLessThanOrEqual(window.end - context.endTime, ScenePlan.maxTail + 4,
                                 "plays \(window.end - context.endTime)s past the sentence")
    }

    func test_opensTheSentenceWithTheLinesThatFollowIt() throws {
        let context = try storksContext()
        let fullClip = try Fixture.clip("storks")
        let plan = ScenePlan.make(context: context, videoClips: [fullClip])

        XCTAssertEqual(plan.clip.id, fullClip.id)
        // The scene can carry the sentence under another line id; the start
        // time is what both endpoints agree on.
        let first = try XCTUnwrap(plan.clip.lines.first)
        XCTAssertEqual(first.startTime, context.startTime, accuracy: 0.1, "the tapped sentence comes first")
        XCTAssertLessThanOrEqual(plan.clip.lines.count, 1 + ScenePlan.followingLines)
        let scene = ClipTiming.sanitize(fullClip).lines.map(\.id)
        let start = try XCTUnwrap(scene.firstIndex(of: first.id))
        XCTAssertEqual(plan.clip.lines.map(\.id), Array(scene[start..<(start + plan.clip.lines.count)]),
                       "the following lines, in scene order")
        XCTAssertEqual(plan.startAt, context.startTime - ScenePlan.leadIn, accuracy: 0.05)
        let window = ClipTiming.playbackWindow(for: plan.clip)
        XCTAssertGreaterThanOrEqual(plan.startAt, window.start)
        XCTAssertLessThan(plan.startAt, window.end)
    }

    func test_fallsBackToTheSentenceWhenTheSceneIsUnavailable() throws {
        let feed = try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json")
        for item in feed.items {
            let ctx = item.context
            let plan = ScenePlan.make(context: ctx, videoClips: nil)
            XCTAssertEqual(plan.clip.lines.map(\.id), [ctx.lineId])
            XCTAssertEqual(plan.clip.youtubeVideoId, ctx.youtubeVideoId)
            XCTAssertEqual(plan.startAt, max(0, ctx.startTime - ScenePlan.leadIn), accuracy: 0.05,
                           "line \(ctx.lineId) must start at its sentence, not the scene start")
            // Only the sentence plays, not the rest of the scene it came from.
            let window = ClipTiming.playbackWindow(for: plan.clip)
            XCTAssertLessThanOrEqual(window.end, ctx.endTime + 1.5, "line \(ctx.lineId)")
        }
    }

    func test_ignoresScenesThatDoNotContainTheSentence() throws {
        let context = try storksContext()
        let unrelated = try Fixture.clip("frozen")
        let plan = ScenePlan.make(context: context, videoClips: [unrelated])
        XCTAssertEqual(plan.clip.lines.map(\.id), [context.lineId])
    }

    func test_asLessonClipNoLongerNeedsForceTry() throws {
        // Built with memberwise inits now; must round-trip every field.
        let feed = try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json")
        for item in feed.items {
            let ctx = item.context
            let clip = ctx.asLessonClip()
            let line = try XCTUnwrap(clip.lines.first)
            XCTAssertEqual(line.id, ctx.lineId)
            XCTAssertEqual(line.words, ctx.words)
            XCTAssertEqual(line.structure, ctx.structure)
            XCTAssertEqual(line.isTarget, true)
            XCTAssertEqual(clip.startTime, ctx.clipStartTime)
            XCTAssertEqual(clip.endTime, ctx.clipEndTime)
        }
    }

    func test_reelLoopWindowWrapsTheSentence() throws {
        let feed = try Fixture.decode(VocabFeedResponse.self, "vocab-feed.json")
        for item in feed.items {
            let ctx = item.context
            let w = ctx.loopWindow()
            XCTAssertEqual(w.start, max(0, ctx.startTime - 0.4), accuracy: 1e-9)
            XCTAssertEqual(w.end, ctx.endTime + 0.6, accuracy: 1e-9)
            XCTAssertEqual(ctx.syncLine.id, ctx.lineId)
            for word in ctx.syncLine.words {
                XCTAssertGreaterThanOrEqual(word.startTime, ctx.syncLine.startTime - 1e-9)
                XCTAssertLessThanOrEqual(word.endTime, ctx.syncLine.endTime + 1e-9)
            }
        }
    }
}
