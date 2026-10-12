import XCTest
@testable import EnglishLearning

final class KaraokeTimelineTests: XCTestCase {

    // MARK: - Helpers

    private func word(_ text: String, _ start: Double, _ end: Double, _ index: Int) -> ClipWord {
        ClipWord(word: text, startTime: start, endTime: end, wordIndex: index,
                 starterId: nil, starterTr: nil, translationTr: nil)
    }

    private func line(_ id: Int, _ start: Double, _ end: Double, _ words: [ClipWord]) -> ClipLine {
        ClipLine(id: id, speaker: "", text: words.map(\.word).joined(separator: " "),
                 translationTr: nil, startTime: start, endTime: end,
                 isTarget: nil, structure: nil, words: words)
    }

    /// "I am happy" 10.0–11.0, silence, "Me too" 12.0–12.6
    private var twoLines: [ClipLine] {
        [
            line(1, 10.0, 11.0, [word("I", 10.0, 10.15, 0), word("am", 10.2, 10.4, 1), word("happy", 10.45, 11.0, 2)]),
            line(2, 12.0, 12.6, [word("Me", 12.0, 12.2, 0), word("too", 12.25, 12.6, 1)]),
        ]
    }

    // MARK: - Line / word position

    func test_noLineBeforeTheFirstLineStarts() {
        let tl = KaraokeTimeline(lines: twoLines, lead: 0)
        XCTAssertEqual(tl.position(at: 9.0), .none)
        XCTAssertNil(tl.position(at: 9.99).lineIndex)
    }

    func test_activeWordIsStickyAcrossTinyGapsBetweenWords() {
        // 10.15–10.2 is a gap between "I" and "am": the highlight must stay
        // on "I" instead of blinking off for a frame.
        let tl = KaraokeTimeline(lines: twoLines, lead: 0)
        XCTAssertEqual(tl.position(at: 10.05), SyncPosition(lineIndex: 0, progress: .speaking(0)))
        XCTAssertEqual(tl.position(at: 10.17), SyncPosition(lineIndex: 0, progress: .speaking(0)))
        XCTAssertEqual(tl.position(at: 10.2), SyncPosition(lineIndex: 0, progress: .speaking(1)))
        XCTAssertEqual(tl.position(at: 10.99), SyncPosition(lineIndex: 0, progress: .speaking(2)))
    }

    func test_lineStaysOnScreenThroughSilenceAsFinished() {
        let tl = KaraokeTimeline(lines: twoLines, lead: 0)
        XCTAssertEqual(tl.position(at: 11.5), SyncPosition(lineIndex: 0, progress: .finished))
        XCTAssertEqual(tl.position(at: 12.0), SyncPosition(lineIndex: 1, progress: .speaking(0)))
        XCTAssertEqual(tl.position(at: 50.0), SyncPosition(lineIndex: 1, progress: .finished))
    }

    func test_leadHighlightsSlightlyEarlyToHideBridgeLatency() {
        let tl = KaraokeTimeline(lines: twoLines, lead: 0.05)
        XCTAssertEqual(tl.position(at: 10.16), SyncPosition(lineIndex: 0, progress: .speaking(1)))
        XCTAssertEqual(tl.position(at: 9.96), SyncPosition(lineIndex: 0, progress: .speaking(0)))
    }

    func test_lineBeforeItsFirstWordIsNotStarted() {
        let lines = [line(1, 5.0, 7.0, [word("Hello", 5.5, 6.0, 0)])]
        let tl = KaraokeTimeline(lines: lines, lead: 0)
        XCTAssertEqual(tl.position(at: 5.2), SyncPosition(lineIndex: 0, progress: .notStarted))
    }

    func test_wordPhases() {
        let p = SyncPosition(lineIndex: 1, progress: .speaking(1))
        XCTAssertEqual(p.phase(ofWord: 5, inLine: 0), .past)
        XCTAssertEqual(p.phase(ofWord: 0, inLine: 1), .past)
        XCTAssertEqual(p.phase(ofWord: 1, inLine: 1), .active)
        XCTAssertEqual(p.phase(ofWord: 2, inLine: 1), .upcoming)
        XCTAssertEqual(p.phase(ofWord: 0, inLine: 2), .upcoming)
        XCTAssertEqual(p.activeWordIndex, 1)

        XCTAssertEqual(SyncPosition(lineIndex: 0, progress: .finished).phase(ofWord: 3, inLine: 0), .past)
        XCTAssertEqual(SyncPosition(lineIndex: 0, progress: .notStarted).phase(ofWord: 0, inLine: 0), .upcoming)
        XCTAssertEqual(SyncPosition.none.phase(ofWord: 0, inLine: 0), .upcoming)
        XCTAssertNil(SyncPosition(lineIndex: 0, progress: .finished).activeWordIndex)
    }

    func test_phaseOfMultiWordCell() {
        // Phrasal verbs / split contractions render several words as one cell.
        let p = SyncPosition(lineIndex: 0, progress: .speaking(3))
        XCTAssertEqual(p.phase(ofWords: 2...3, inLine: 0), .active)
        XCTAssertEqual(p.phase(ofWords: 0...2, inLine: 0), .past)
        XCTAssertEqual(p.phase(ofWords: 4...5, inLine: 0), .upcoming)
    }

    // MARK: - Real data: nothing is skipped, nothing lags

    /// Plays every fixture clip through `SyncDriver` the way the app does:
    /// bridge ticks every 100ms arriving 0–30ms late, frames at 60 Hz.
    /// Every word must light up, and the frame-by-frame position must match
    /// the ground truth almost always.
    func test_realClips_everyWordLightsUp_andHighlightTracksTheAudio() throws {
        for rate in [1.0, 0.75, 0.5] {
            for clip in try Fixture.allClips() {
                let sanitized = ClipTiming.sanitize(clip)
                let window = ClipTiming.playbackWindow(for: sanitized)
                let result = simulate(lines: sanitized.lines, window: window, rate: rate,
                                      tickInterval: 0.1, maxLatency: 0.03, fps: 60)
                let label = "clip \(clip.id) @\(rate)x"
                XCTAssertEqual(result.missedWords, [], "\(label): words never highlighted")
                XCTAssertGreaterThanOrEqual(result.frameAccuracy, 0.9, "\(label): highlight drifted from the audio")
            }
        }
    }

    /// The pre-fix pipeline (no interpolation, 220ms ticks) for reference:
    /// documents why interpolation is required, using the same harness.
    func test_realClips_sparseTicksWithoutInterpolationWouldMissWords() throws {
        let clip = ClipTiming.sanitize(try Fixture.clip("storks"))
        let timeline = KaraokeTimeline(lines: clip.lines, lead: 0)
        var seen = Set<WordKey>()
        var t = ClipTiming.playbackWindow(for: clip).start
        while t < ClipTiming.playbackWindow(for: clip).end {
            if let w = WordKey(timeline.position(at: t)) { seen.insert(w) }
            t += 0.22
        }
        let total = clip.lines.reduce(0) { $0 + $1.words.count }
        XCTAssertLessThan(Double(seen.count) / Double(total), 0.9,
                          "sanity: sampling at 220ms should visibly skip words")
    }

    // MARK: - Simulation

    private struct WordKey: Hashable {
        let line: Int, word: Int
        init?(_ p: SyncPosition) {
            guard let l = p.lineIndex, let w = p.activeWordIndex else { return nil }
            line = l; word = w
        }
        init(line: Int, word: Int) { self.line = line; self.word = word }
    }

    private struct SimResult {
        var missedWords: [String]
        var frameAccuracy: Double
    }

    private func simulate(lines: [ClipLine], window: PlaybackWindow, rate: Double,
                          tickInterval: Double, maxLatency: Double, fps: Double) -> SimResult {
        let truthTimeline = KaraokeTimeline(lines: lines)
        var driver = SyncDriver(lines: lines)
        let h0 = 1_000.0
        let media = { (h: Double) in window.start + (h - h0) * rate }
        let hostEnd = h0 + window.duration / rate

        // Bridge ticks: taken at tickHost, delivered `latency` later.
        var deliveries: [(deliverAt: Double, mediaTime: Double)] = []
        var k = 0
        while true {
            let taken = h0 + Double(k) * tickInterval
            if taken > hostEnd { break }
            let latency = maxLatency * Double((k * 7919) % 13) / 12.0   // deterministic 0…max
            deliveries.append((taken + latency, media(taken)))
            k += 1
        }
        driver.setRate(rate, hostTime: h0)
        driver.jump(to: window.start, hostTime: h0)
        driver.setPlaying(true, hostTime: h0)

        var seen = Set<WordKey>()
        var correct = 0, frames = 0, next = 0
        var h = h0
        while h <= hostEnd {
            while next < deliveries.count, deliveries[next].deliverAt <= h {
                driver.tick(mediaTime: deliveries[next].mediaTime,
                            hostTime: deliveries[next].deliverAt, isPlaying: true)
                next += 1
            }
            _ = driver.update(hostTime: h)
            if let w = WordKey(driver.position) { seen.insert(w) }
            if driver.position == truthTimeline.position(at: media(h)) { correct += 1 }
            frames += 1
            h += 1.0 / fps
        }

        var missed: [String] = []
        for (li, line) in lines.enumerated() {
            for (wi, w) in line.words.enumerated() {
                // Time this word owns the highlight (sticky until the next
                // word starts). Sub-frame slivers can't be shown by any
                // renderer, so they're exempt.
                let nextStart = wi + 1 < line.words.count ? line.words[wi + 1].startTime : line.endTime
                let owned = (nextStart - w.startTime) / rate
                if owned >= 2.0 / fps, !seen.contains(WordKey(line: li, word: wi)) {
                    missed.append("\(line.id):\(wi):\(w.word)")
                }
            }
        }
        return SimResult(missedWords: missed, frameAccuracy: Double(correct) / Double(max(frames, 1)))
    }
}
