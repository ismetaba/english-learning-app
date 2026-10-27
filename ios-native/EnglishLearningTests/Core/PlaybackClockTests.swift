import XCTest
@testable import EnglishLearning

/// The YouTube bridge reports the playhead only every ~100ms (it was 220ms),
/// while the median word lasts 160ms. `PlaybackClock` turns those sparse
/// ticks into a smooth per-frame media time.
final class PlaybackClockTests: XCTestCase {
    func test_extrapolatesBetweenTicksWhilePlaying() {
        var clock = PlaybackClock()
        clock.tick(mediaTime: 10.0, hostTime: 100.0, isPlaying: true)
        XCTAssertEqual(clock.time(at: 100.0), 10.0, accuracy: 1e-9)
        XCTAssertEqual(clock.time(at: 100.1), 10.1, accuracy: 1e-9)
        XCTAssertEqual(clock.time(at: 100.25), 10.25, accuracy: 1e-9)
    }

    func test_extrapolationHonoursPlaybackRate() {
        var clock = PlaybackClock()
        clock.setRate(0.75, hostTime: 99.0)
        clock.tick(mediaTime: 10.0, hostTime: 100.0, isPlaying: true)
        XCTAssertEqual(clock.time(at: 100.2), 10.15, accuracy: 1e-9)
        XCTAssertEqual(clock.rate, 0.75)
    }

    func test_doesNotAdvanceWhilePaused() {
        var clock = PlaybackClock()
        clock.tick(mediaTime: 42.0, hostTime: 100.0, isPlaying: false)
        XCTAssertEqual(clock.time(at: 103.0), 42.0, accuracy: 1e-9)
        XCTAssertFalse(clock.isPlaying)
    }

    func test_pausingFreezesAtTheExtrapolatedTime() {
        var clock = PlaybackClock()
        clock.tick(mediaTime: 10.0, hostTime: 100.0, isPlaying: true)
        clock.setPlaying(false, hostTime: 100.08)
        XCTAssertEqual(clock.time(at: 101.0), 10.08, accuracy: 1e-9)
    }

    func test_extrapolationIsCappedWhenTicksStop() {
        // If the bridge stalls (buffering, backgrounded WebView) the
        // karaoke must not race ahead of the audio.
        var clock = PlaybackClock()
        clock.tick(mediaTime: 10.0, hostTime: 100.0, isPlaying: true)
        let t = clock.time(at: 105.0)
        XCTAssertLessThanOrEqual(t, 10.0 + PlaybackClock.maxExtrapolation + 1e-9)
        XCTAssertGreaterThan(t, 10.0)
    }

    func test_smallBackwardJitterNeverMovesTheHighlightBackwards() {
        var clock = PlaybackClock()
        clock.tick(mediaTime: 10.0, hostTime: 100.0, isPlaying: true)
        let shown = clock.time(at: 100.2)          // 10.2 on screen
        clock.tick(mediaTime: 10.12, hostTime: 100.21, isPlaying: true) // late tick, slightly behind
        XCTAssertGreaterThanOrEqual(clock.time(at: 100.21), shown)
        // ...and it converges to the reported time once it catches up.
        XCTAssertEqual(clock.time(at: 100.40), 10.31, accuracy: 1e-9)
    }

    func test_largeBackwardMovesPassThrough() {
        // A seek or a loop wrap reported by the player must apply at once.
        var clock = PlaybackClock()
        clock.tick(mediaTime: 22.0, hostTime: 100.0, isPlaying: true)
        _ = clock.time(at: 100.1)
        clock.tick(mediaTime: 20.5, hostTime: 100.15, isPlaying: true)
        XCTAssertEqual(clock.time(at: 100.15), 20.5, accuracy: 1e-9)
    }

    func test_jumpRepositionsImmediately() {
        var clock = PlaybackClock()
        clock.tick(mediaTime: 30.0, hostTime: 100.0, isPlaying: true)
        _ = clock.time(at: 100.1)
        clock.jump(to: 29.95, hostTime: 100.1)   // tiny backward seek (replay line)
        XCTAssertEqual(clock.time(at: 100.1), 29.95, accuracy: 1e-9)
    }
}
