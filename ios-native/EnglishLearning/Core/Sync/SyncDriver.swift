import Foundation

// STUB — API contract only. Implementation pending (see KaraokeTimelineTests).

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

    init(lines: [ClipLine], lead: Double = KaraokeTimeline.defaultLead) {
        timeline = KaraokeTimeline(lines: lines, lead: lead)
    }

    mutating func replaceLines(_ lines: [ClipLine]) {
        timeline = KaraokeTimeline(lines: lines, lead: timeline.lead)
    }

    mutating func tick(mediaTime: Double, hostTime: Double, isPlaying: Bool) {
        clock.tick(mediaTime: mediaTime, hostTime: hostTime, isPlaying: isPlaying)
    }

    mutating func setRate(_ rate: Double, hostTime: Double) { clock.setRate(rate, hostTime: hostTime) }

    mutating func setPlaying(_ playing: Bool, hostTime: Double) { clock.setPlaying(playing, hostTime: hostTime) }

    mutating func jump(to mediaTime: Double, hostTime: Double) { clock.jump(to: mediaTime, hostTime: hostTime) }

    /// Advances to `hostTime`; returns true when `position` changed.
    @discardableResult
    mutating func update(hostTime: Double) -> Bool { false }
}
