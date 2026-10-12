import Foundation

// STUB — API contract only. Implementation pending (see PlaybackClockTests).

/// Media-time clock that turns the YouTube bridge's sparse playhead ticks
/// into a smooth per-frame time for karaoke rendering.
struct PlaybackClock: Equatable {
    /// Longest stretch (host seconds) we extrapolate past the last tick.
    static let maxExtrapolation: Double = 0.5
    /// Backward corrections smaller than this are absorbed (held) instead
    /// of moving the highlight backwards; larger ones (seeks, loop wraps)
    /// pass through.
    static let backwardTolerance: Double = 0.3

    private(set) var rate: Double = 1
    private(set) var isPlaying: Bool = false
    private var anchorMedia: Double = 0

    init() {}

    mutating func tick(mediaTime: Double, hostTime: Double, isPlaying: Bool) {
        anchorMedia = mediaTime
        self.isPlaying = isPlaying
    }

    mutating func setRate(_ rate: Double, hostTime: Double) { self.rate = rate }

    mutating func setPlaying(_ playing: Bool, hostTime: Double) { isPlaying = playing }

    mutating func jump(to mediaTime: Double, hostTime: Double) { anchorMedia = mediaTime }

    mutating func time(at hostTime: Double) -> Double { anchorMedia }
}
