import Foundation

/// Media-time clock that turns the YouTube bridge's sparse playhead ticks
/// into a smooth per-frame time for karaoke rendering.
///
/// Each tick anchors (media time, host time); between ticks the time is
/// extrapolated at the playback rate. `hostTime` is any monotonic clock in
/// seconds (e.g. `CACurrentMediaTime()` / the display link timestamp).
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
    private var anchorHost: Double = 0
    /// Last value handed out by `time(at:)`; nothing shown yet initially.
    private var lastReturned: Double = -.infinity
    /// Set by `jump` so the next reading may move backwards freely.
    private var jumpPending = false

    init() {}

    /// A playhead report from the player.
    mutating func tick(mediaTime: Double, hostTime: Double, isPlaying: Bool) {
        anchorMedia = mediaTime
        anchorHost = hostTime
        self.isPlaying = isPlaying
    }

    mutating func setRate(_ rate: Double, hostTime: Double) {
        reanchor(at: hostTime)
        self.rate = rate
    }

    /// Pausing freezes at the extrapolated time, not the last tick, so the
    /// highlight doesn't jump back when the learner pauses.
    mutating func setPlaying(_ playing: Bool, hostTime: Double) {
        reanchor(at: hostTime)
        isPlaying = playing
    }

    /// A seek we issued ourselves (replay line, loop): applies immediately,
    /// even if it is a tiny step backwards.
    mutating func jump(to mediaTime: Double, hostTime: Double) {
        anchorMedia = mediaTime
        anchorHost = hostTime
        jumpPending = true
    }

    /// Media time to render at `hostTime`. Ticks arrive late by a varying
    /// amount, so consecutive anchors can disagree by a few tens of ms;
    /// small backward steps are held so the highlight never flickers back
    /// a word, while seeks and loop wraps (larger steps) apply at once.
    mutating func time(at hostTime: Double) -> Double {
        var t = extrapolated(at: hostTime)
        if !jumpPending, t < lastReturned, lastReturned - t <= Self.backwardTolerance {
            t = lastReturned
        }
        lastReturned = t
        jumpPending = false
        return t
    }

    private func extrapolated(at hostTime: Double) -> Double {
        guard isPlaying else { return anchorMedia }
        let elapsed = min(max(hostTime - anchorHost, 0), Self.maxExtrapolation)
        return anchorMedia + elapsed * rate
    }

    private mutating func reanchor(at hostTime: Double) {
        anchorMedia = extrapolated(at: hostTime)
        anchorHost = hostTime
    }
}
