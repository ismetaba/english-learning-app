import Foundation

/// Pure core of the karaoke driver: feed it player events and frame times,
/// read back the current `SyncPosition`. The SwiftUI wrapper calls
/// `update(hostTime:)` once per display frame and publishes only when the
/// position changes.
struct SyncDriver {
    private(set) var clock = PlaybackClock()
    private(set) var timeline: KaraokeTimeline
    private(set) var position: SyncPosition = .none
    /// Interpolated media time computed by the last `update(hostTime:)`.
    private(set) var time: Double = 0
    /// Line that owns its lead-in (`KaraokeTimeline.position(at:pinnedLine:)`).
    private(set) var pinnedLine: Int?

    /// Playback this far past a pinned line's end means the jump is over:
    /// the pin lets go by itself. A looped line wraps back long before
    /// (its tail is 0.2s), so a loop keeps its pin.
    static let pinRelease: Double = 1.5

    init(lines: [ClipLine], lead: Double = KaraokeTimeline.defaultLead) {
        timeline = KaraokeTimeline(lines: lines, lead: lead)
    }

    /// Line `line` (an index into the current lines) shows from its lead-in
    /// on, across loop wraps, instead of the line before it; nil unpins.
    /// Takes effect at the next `update`.
    mutating func pin(line: Int?) {
        pinnedLine = line
    }

    /// Swaps the subtitle lines (next clip, scene loaded) keeping the lead.
    /// `position` refers to the old lines until the next `update`, which
    /// recomputes it from scratch. A pin indexed the old lines, so it goes.
    mutating func replaceLines(_ lines: [ClipLine]) {
        timeline = KaraokeTimeline(lines: lines, lead: timeline.lead)
        pinnedLine = nil
    }

    mutating func tick(mediaTime: Double, hostTime: Double, isPlaying: Bool) {
        clock.tick(mediaTime: mediaTime, hostTime: hostTime, isPlaying: isPlaying)
    }

    mutating func setRate(_ rate: Double, hostTime: Double) { clock.setRate(rate, hostTime: hostTime) }

    mutating func setPlaying(_ playing: Bool, hostTime: Double) { clock.setPlaying(playing, hostTime: hostTime) }

    mutating func jump(to mediaTime: Double, hostTime: Double) { clock.jump(to: mediaTime, hostTime: hostTime) }

    /// The clock is advancing (frames are worth rendering).
    var isPlaying: Bool { clock.isPlaying }

    /// Applies one page event, received at `hostTime`. Ticks and loop wraps
    /// that predate a seek are the caller's to drop (`KaraokeSync`).
    mutating func handle(_ event: PlayerEvent, hostTime: Double) {
        switch event {
        case .time(let t, let playing):
            tick(mediaTime: t, hostTime: hostTime, isPlaying: playing)
        case .state(let state):
            // Buffering doesn't advance the media, so it freezes the clock
            // like a pause does.
            setPlaying(state == .playing, hostTime: hostTime)
        case .clipEnded(let t):
            tick(mediaTime: t, hostTime: hostTime, isPlaying: false)
            // A loop never ends the window, so a jump's pin is spent; a
            // replay from the start mustn't find it.
            pin(line: nil)
        case .looped(let t):
            // A wrap is a seek the page made: a short loop steps back less
            // than the clock holds as jitter, so it jumps. It keeps the
            // loop's pin and the play state, so every pass shows the
            // looped line from its lead-in.
            jump(to: t, hostTime: hostTime)
        case .error:
            setPlaying(false, hostTime: hostTime)
        case .bridgeReady, .ready:
            break
        }
    }

    /// Advances to `hostTime`; returns true when `position` changed.
    @discardableResult
    mutating func update(hostTime: Double) -> Bool {
        time = clock.time(at: hostTime)
        if let pin = pinnedLine,
           !timeline.lines.indices.contains(pin) || time > timeline.lines[pin].endTime + Self.pinRelease {
            pinnedLine = nil
        }
        let next = timeline.position(at: time, pinnedLine: pinnedLine)
        guard next != position else { return false }
        position = next
        return true
    }
}
