import SwiftUI
import QuartzCore

/// Drives the karaoke for one player. Feed it every `PlayerEvent` from the
/// player's controller (in order) and it steps a `SyncDriver` on each
/// display frame while the video plays.
///
/// Views observe `position`, which only changes when the highlighted word
/// or line does (a few times a second), so the frame loop never re-renders
/// the screen by itself. `coarseTime` is a ~4 Hz playhead for scrubbers and
/// timers that don't need frame precision.
@MainActor
final class KaraokeSync: ObservableObject {
    @Published private(set) var position: SyncPosition = .none
    @Published private(set) var coarseTime: Double = 0
    /// Interpolated media time at the last frame.
    private(set) var time: Double = 0

    private var driver: SyncDriver
    /// After we seek, ticks the page sent before the seek landed can still
    /// arrive; they'd yank the highlight back to the old spot for a frame.
    private var pendingSeek: (target: Double, until: Double)?
    private let frames = FrameTicker()

    init(lines: [ClipLine] = []) {
        driver = SyncDriver(lines: lines)
        frames.onFrame = { [weak self] host in self?.step(host) }
    }

    deinit {
        frames.stop()
    }

    /// Swap the subtitle lines (next clip). Lines should be sanitized
    /// (`ClipTiming.sanitize`).
    func setLines(_ lines: [ClipLine]) {
        driver.replaceLines(lines)
        step(CACurrentMediaTime())
    }

    func handle(_ event: PlayerEvent, hostTime: Double) {
        switch event {
        case .time(let t, let playing):
            if let seek = pendingSeek {
                if hostTime < seek.until, abs(t - seek.target) > 1.0 { return }
                pendingSeek = nil
            }
            driver.tick(mediaTime: t, hostTime: hostTime, isPlaying: playing)
            frames.setRunning(playing)
        case .state(let state):
            // Buffering doesn't advance the media, so it freezes the clock
            // like a pause does.
            let playing = state == .playing
            driver.setPlaying(playing, hostTime: hostTime)
            frames.setRunning(playing)
        case .clipEnded(let t):
            driver.tick(mediaTime: t, hostTime: hostTime, isPlaying: false)
            // A loop never ends the window, so a jump's pin is spent; a
            // replay from the start mustn't find it.
            driver.pin(line: nil)
            frames.setRunning(false)
        case .error:
            driver.setPlaying(false, hostTime: hostTime)
            frames.setRunning(false)
        case .bridgeReady, .ready:
            break
        }
        step(hostTime)
    }

    /// Call right after issuing a seek so the highlight moves at once
    /// instead of waiting for the page's next tick. Clears a pinned line.
    func jump(to t: Double) {
        jump(to: t, pinning: nil)
    }

    /// A seek into line `line`'s lead-in (jump to a line, loop it): that
    /// line shows from the jump on, and on every loop wrap, instead of the
    /// line before it until its first word. `line` indexes the current
    /// lines; nil is a plain `jump(to:)`. The pin lets go once playback is
    /// well past the line, at the clip's end, on new lines or the next jump.
    func jump(to t: Double, pinning line: Int?) {
        let now = CACurrentMediaTime()
        driver.pin(line: line)
        driver.jump(to: t, hostTime: now)
        pendingSeek = (t, now + 0.6)
        step(now)
    }

    /// Pins (or with nil unpins) a line without seeking, e.g. when a loop
    /// starts or stops on the line already playing.
    func setPinnedLine(_ line: Int?) {
        driver.pin(line: line)
        step(CACurrentMediaTime())
    }

    func setRate(_ rate: Double) {
        driver.setRate(rate, hostTime: CACurrentMediaTime())
    }

    private func step(_ hostTime: Double) {
        if driver.update(hostTime: hostTime) {
            position = driver.position
        }
        time = driver.time
        if abs(time - coarseTime) >= 0.25 {
            coarseTime = time
        }
    }
}

/// CADisplayLink wrapper. The link retains its target, so the target is
/// this small box rather than the observable object, and `stop()` is safe
/// to call from `deinit`.
private final class FrameTicker: NSObject {
    var onFrame: (@MainActor (Double) -> Void)?
    private var link: CADisplayLink?

    func setRunning(_ running: Bool) {
        if running, link == nil {
            let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
        } else if !running {
            stop()
        }
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    @objc private func frame(_ link: CADisplayLink) {
        // Render for the moment this frame will actually be on screen.
        let target = link.targetTimestamp
        // The link is scheduled on the main run loop.
        MainActor.assumeIsolated { onFrame?(target) }
    }
}
