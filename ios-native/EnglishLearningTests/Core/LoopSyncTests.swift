import XCTest
@testable import EnglishLearning

/// Merge review (2026-10-27): looping a short line ("No!", "What?") froze
/// the karaoke after the first pass, or showed the next line while the
/// audio repeated the looped one. The page's wrap reached Swift as a plain
/// time tick, and a step back of up to 0.3 s is what `PlaybackClock` holds
/// as jitter; `ClipTiming.loopWindow` gives short lines 0.2-0.33 s windows.
final class LoopSyncTests: XCTestCase {

    /// What one simulated loop of `line` showed, pass by pass.
    private struct Passes {
        var sawWord: [Bool]
        var strayLines: [Set<Int>]
    }

    /// Plays line `i`'s loop window the way the app and its page do:
    /// `toggleLoop` pins the line and jumps to the window start; the page
    /// ticks about every 100 ms and wraps 30 ms (`END_EPS`) before the
    /// end, announcing the wrap with `wrapEvent`. Events reach Swift
    /// 20 ms late; the karaoke renders at 60 fps.
    private func loop(line i: Int, in lines: [ClipLine], rate: Double, passes: Int = 3,
                      wrapEvent: (Double) -> PlayerEvent) -> Passes {
        let window = ClipTiming.loopWindow(forLine: i, in: lines)!
        let latency = 0.02, tickEvery = 0.1, frame = 1.0 / 60
        var driver = SyncDriver(lines: lines)
        driver.setRate(rate, hostTime: 0)
        driver.pin(line: i)
        driver.jump(to: window.start, hostTime: 0)
        driver.handle(.state(.playing), hostTime: latency)

        var result = Passes(sawWord: Array(repeating: false, count: passes),
                            strayLines: Array(repeating: [], count: passes))
        // Page side: media time, the next tick, and events in flight.
        var media = window.start, nextTick = tickEvery
        var inFlight: [(at: Double, event: PlayerEvent)] = []
        var pass = 0, host = 0.0
        while pass < passes {
            host += frame
            media += frame * rate
            if media >= window.end - 0.03 {
                media = window.start
                inFlight.append((host + latency, wrapEvent(window.start)))
                nextTick = host + tickEvery
            } else if host >= nextTick {
                inFlight.append((host + latency, .time(media, isPlaying: true)))
                nextTick += tickEvery
            }
            // Swift side: deliver what has arrived, then render a frame.
            while let first = inFlight.first, first.at <= host {
                inFlight.removeFirst()
                driver.handle(first.event, hostTime: first.at)
                if case .looped = first.event { pass += 1 }
                if case .time(let t, _) = first.event, t == window.start { pass += 1 }
            }
            guard pass < passes else { break }
            driver.update(hostTime: host)
            if let shown = driver.position.lineIndex, shown != i {
                result.strayLines[pass].insert(shown)
            } else if driver.position.lineIndex == i, driver.position.activeWordIndex != nil {
                result.sawWord[pass] = true
            }
        }
        return result
    }

    /// Lines whose loop window the page actually loops (shorter windows
    /// play once; the page's `MIN_LOOP` is 0.2 s). Lines the next line
    /// overlaps are left out: the karaoke shows the later line there
    /// whatever the loop does.
    private func loopableLines(_ clip: LessonClip) -> [Int] {
        let lines = clip.lines
        return lines.indices.filter { i in
            let overlapped = lines.indices.contains(i + 1)
                && lines[i + 1].startTime - KaraokeTimeline.defaultLead <= lines[i].endTime
            return !lines[i].words.isEmpty && !overlapped
                && ClipTiming.loopWindow(forLine: i, in: lines)!.duration >= 0.2
        }
    }

    func test_reproduces_plainTimeWrapsFreezeShortLoops() throws {
        var frozen: [String] = []
        for clip in try Fixture.allClips().map(ClipTiming.sanitize) {
            for i in loopableLines(clip) {
                let r = loop(line: i, in: clip.lines, rate: 1) { .time($0, isPlaying: true) }
                if r.sawWord.contains(false) { frozen.append("\(clip.id)#\(i)") }
            }
        }
        XCTAssertFalse(frozen.isEmpty, "a wrap sent as a plain tick should freeze some short loop")
    }

    func test_everyLoopPassHighlightsTheLoopedLine() throws {
        for rate in [1.0, 0.75, 0.5] {
            for clip in try Fixture.allClips().map(ClipTiming.sanitize) {
                for i in loopableLines(clip) {
                    let window = ClipTiming.loopWindow(forLine: i, in: clip.lines)!
                    let r = loop(line: i, in: clip.lines, rate: rate) { .looped($0) }
                    let label = "clip \(clip.id) line \(i) \"\(clip.lines[i].text)\" loop \(String(format: "%.2f", window.duration))s @\(rate)x"
                    XCTAssertEqual(r.sawWord, [true, true, true], "\(label): a pass without its words lit")
                    XCTAssertEqual(r.strayLines, [[], [], []], "\(label): another line shown during the loop")
                }
            }
        }
    }

    func test_aWrapKeepsTheLoopsPin() throws {
        let clip = ClipTiming.sanitize(try Fixture.clip("storks"))
        let i = try XCTUnwrap(loopableLines(clip).first { ClipTiming.loopWindow(forLine: $0, in: clip.lines)!.duration < 0.4 })
        var driver = SyncDriver(lines: clip.lines)
        driver.pin(line: i)
        driver.handle(.looped(ClipTiming.loopWindow(forLine: i, in: clip.lines)!.start), hostTime: 1)
        XCTAssertEqual(driver.pinnedLine, i)
    }

    // MARK: - Protocol

    func test_pageWrapIsParsedAsALoopPass() {
        XCTAssertEqual(PlayerEvent.parse(["kind": "loop", "t": 20.5]), .looped(20.5))
        XCTAssertEqual(PlayerEvent.parse(["kind": "loop", "t": NSNumber(value: 3)]), .looped(3))
        XCTAssertNil(PlayerEvent.parse(["kind": "loop"]))
        XCTAssertNil(PlayerEvent.parse(["kind": "loop", "t": "x"]))
    }

    // MARK: - Loop window

    func test_loopWindowCoversTheLineAndStopsBeforeTheNextOne() throws {
        for clip in try Fixture.allClips().map(ClipTiming.sanitize) {
            for i in clip.lines.indices {
                let w = try XCTUnwrap(ClipTiming.loopWindow(forLine: i, in: clip.lines))
                let line = clip.lines[i]
                XCTAssertLessThanOrEqual(w.start, line.startTime)
                XCTAssertGreaterThanOrEqual(w.end, line.endTime)
                if clip.lines.indices.contains(i + 1), line.endTime < clip.lines[i + 1].startTime - KaraokeTimeline.defaultLead {
                    XCTAssertLessThan(w.end, clip.lines[i + 1].startTime - KaraokeTimeline.defaultLead,
                                      "clip \(clip.id) line \(i): the loop runs into the next line's lead")
                }
            }
        }
        XCTAssertNil(ClipTiming.loopWindow(forLine: 0, in: []))
    }
}
