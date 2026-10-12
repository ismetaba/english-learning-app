import XCTest
@testable import EnglishLearning

final class ClipTimingTests: XCTestCase {

    private func word(_ text: String, _ start: Double, _ end: Double, _ index: Int?) -> ClipWord {
        ClipWord(word: text, startTime: start, endTime: end, wordIndex: index,
                 starterId: nil, starterTr: nil, translationTr: nil)
    }

    private func line(_ id: Int, _ start: Double, _ end: Double, _ words: [ClipWord]) -> ClipLine {
        ClipLine(id: id, speaker: "A", text: "t", translationTr: "tr", startTime: start, endTime: end,
                 isTarget: false, structure: ClipLineStructure(subject: [0], auxVerb: [1], rest: []),
                 words: words)
    }

    // MARK: - Playback window

    /// The backend returns every line within ±5s of the clip bounds, so some
    /// subtitle lines start before / end after the clip. Playing the raw
    /// [startTime, endTime] cuts those sentences mid-word (and the karaoke
    /// for them never finishes). 15 of 85 sampled videos are affected.
    func test_playbackWindowPlaysEveryDisplayedLineInFull() throws {
        for clip in try Fixture.allClips() {
            let window = ClipTiming.playbackWindow(for: ClipTiming.sanitize(clip))
            XCTAssertLessThanOrEqual(window.start, clip.startTime)
            XCTAssertGreaterThanOrEqual(window.end, clip.endTime)
            for l in clip.lines {
                XCTAssertLessThanOrEqual(window.start, l.startTime, "clip \(clip.id) line \(l.id) starts before playback")
                XCTAssertGreaterThanOrEqual(window.end, l.endTime, "clip \(clip.id) line \(l.id) is cut off at the end")
            }
        }
    }

    func test_reproduces_rawClipBoundsCutLines() throws {
        let clip = try Fixture.clip("madagascar")
        let outside = clip.lines.filter { $0.startTime < clip.startTime || $0.endTime > clip.endTime }
        XCTAssertFalse(outside.isEmpty, "fixture should contain lines outside the raw clip bounds")
    }

    func test_playbackWindowAddsBreathingRoomButNeverGoesNegative() {
        let clip = LessonClip(id: 1, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 10,
                              lines: [line(1, 0.1, 2, [word("Hi", 0.1, 0.5, 0)])])
        let w = ClipTiming.playbackWindow(for: clip, padding: 0.3)
        XCTAssertEqual(w.start, 0)
        XCTAssertEqual(w.end, 10)
        XCTAssertEqual(w.duration, 10)

        let late = LessonClip(id: 2, youtubeVideoId: "v", movieTitle: "m", startTime: 20, endTime: 30,
                              lines: [line(1, 19.0, 21, [word("Hi", 19.0, 19.5, 0)]),
                                      line(2, 29.5, 30.4, [word("Bye", 29.5, 30.4, 0)])])
        let w2 = ClipTiming.playbackWindow(for: late, padding: 0.3)
        XCTAssertEqual(w2.start, 18.7, accuracy: 1e-9)
        XCTAssertEqual(w2.end, 30.7, accuracy: 1e-9)
    }

    // MARK: - Sanitizing

    func test_sanitizeKeepsWordsInsideTheirLine() throws {
        // dukes-of-hazzard has words timed outside their subtitle line.
        let clip = ClipTiming.sanitize(try Fixture.clip("the-dukes"))
        for l in clip.lines {
            for w in l.words {
                XCTAssertGreaterThanOrEqual(w.startTime, l.startTime - 1e-9, "line \(l.id) word \(w.word)")
                XCTAssertLessThanOrEqual(w.endTime, l.endTime + 1e-9, "line \(l.id) word \(w.word)")
            }
        }
    }

    func test_sanitizeEnforcesInvariants() {
        let messy = line(7, 5.0, 6.0, [
            word("c", 5.6, 5.9, 2),
            word("a", 4.8, 5.1, 0),      // starts before the line
            word("b", 5.3, 5.2, 1),      // end before start
            word("b", 5.3, 5.2, 1),      // duplicate of word_index 1
            word("d", 5.95, 6.4, 3),     // ends after the line
        ])
        let clip = LessonClip(id: 1, youtubeVideoId: "v", movieTitle: "m", startTime: 4, endTime: 8,
                              lines: [line(9, 7.0, 7.5, [word("z", 7.0, 7.5, 0)]), messy])
        let s = ClipTiming.sanitize(clip)

        XCTAssertEqual(s.lines.map(\.id), [7, 9], "lines sorted by start")
        let l = s.lines[0]
        XCTAssertEqual(l.words.map(\.word), ["a", "b", "c", "d"], "sorted, deduplicated")
        for (i, w) in l.words.enumerated() {
            XCTAssertGreaterThanOrEqual(w.endTime - w.startTime, ClipTiming.minimumWordDuration - 1e-9)
            if i > 0 { XCTAssertGreaterThanOrEqual(w.startTime, l.words[i - 1].startTime) }
        }
        XCTAssertLessThanOrEqual(l.startTime, 4.8)
        XCTAssertGreaterThanOrEqual(l.endTime, 6.4)

        // Everything else is carried through untouched.
        XCTAssertEqual(l.speaker, "A")
        XCTAssertEqual(l.translationTr, "tr")
        XCTAssertEqual(l.structure, ClipLineStructure(subject: [0], auxVerb: [1], rest: []))
        XCTAssertEqual(l.words.map(\.wordIndex), [0, 1, 2, 3])
        XCTAssertEqual(s.id, 1)
        XCTAssertEqual(s.youtubeVideoId, "v")
    }

    func test_sanitizeIsIdempotentOnRealData() throws {
        for clip in try Fixture.allClips() {
            let once = ClipTiming.sanitize(clip)
            XCTAssertEqual(ClipTiming.sanitize(once), once)
            XCTAssertEqual(once.lines.count, clip.lines.count, "no subtitle line may be dropped")
        }
    }

    // MARK: - Primary clip choice

    /// UX audit: picking the LONGEST of equally dense cuts made every set
    /// video 4-7 minutes with 20-36s of subtitle-less tail. Equal density
    /// now goes to the shorter cut.
    func test_primaryClipPrefersMostLinesThenShortest() {
        let a = LessonClip(id: 1, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 100,
                           lines: [line(1, 1, 2, [])])
        let b = LessonClip(id: 2, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 50,
                           lines: [line(1, 1, 2, []), line(2, 3, 4, [])])
        let c = LessonClip(id: 3, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 80,
                           lines: [line(1, 1, 2, []), line(2, 3, 4, [])])
        XCTAssertEqual(PrimaryClip.pick([a, b, c])?.id, 2)
        XCTAssertNil(PrimaryClip.pick([]))
    }

    /// A short scene (trimmed window <= 150s) with enough dialogue (>= 8
    /// lines) beats a longer cut that merely has more lines.
    func test_primaryClipPrefersAShortSceneWithEnoughDialogue() {
        func lines(_ n: Int, every step: Double) -> [ClipLine] {
            (0..<n).map { i in line(i, Double(i) * step + 1, Double(i) * step + 2, [word("w", Double(i) * step + 1, Double(i) * step + 1.5, 0)]) }
        }
        let longDense = LessonClip(id: 1, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 400,
                                   lines: lines(20, every: 19))
        let shortEnough = LessonClip(id: 2, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 140,
                                     lines: lines(9, every: 15))
        let shortSparse = LessonClip(id: 3, youtubeVideoId: "v", movieTitle: "m", startTime: 0, endTime: 60,
                                     lines: lines(4, every: 12))
        XCTAssertEqual(PrimaryClip.pick([longDense, shortEnough, shortSparse])?.id, 2)
        // Without any short scene, density decides.
        XCTAssertEqual(PrimaryClip.pick([longDense, shortSparse])?.id, 1)
    }

    // MARK: - Set playback trims dead air

    func test_setWindowTrimsTheSilentHeadAndTail() throws {
        for prefix in ["storks", "frozen", "madagascar"] {
            let clip = ClipTiming.sanitize(try Fixture.clip(prefix))
            let first = try XCTUnwrap(clip.lines.map(\.startTime).min())
            let last = try XCTUnwrap(clip.lines.map(\.endTime).max())
            let w = ClipTiming.playbackWindow(for: clip, trimSilence: true)
            XCTAssertGreaterThanOrEqual(w.start, max(0, first - 3.0) - 1e-9, "\(prefix): more than 3s of silence before the first line")
            XCTAssertLessThanOrEqual(w.end, last + 1.5 + 1e-9, "\(prefix): more than 1.5s of silence after the last line")
            XCTAssertLessThanOrEqual(w.start, first, "\(prefix): first line cut")
            XCTAssertGreaterThanOrEqual(w.end, last, "\(prefix): last line cut")
        }
        // Storks today: first line 11.8s, last line ends 176.0s, clip runs 0-203s.
        let storks = ClipTiming.playbackWindow(for: ClipTiming.sanitize(try Fixture.clip("storks")), trimSilence: true)
        XCTAssertLessThanOrEqual(storks.end, 177.6)
        XCTAssertGreaterThanOrEqual(storks.start, 8.8)
    }

    func test_untrimmedWindowIsUnchanged() throws {
        for clip in try Fixture.allClips().map(ClipTiming.sanitize) {
            XCTAssertEqual(ClipTiming.playbackWindow(for: clip, trimSilence: false), ClipTiming.playbackWindow(for: clip))
        }
    }
}
