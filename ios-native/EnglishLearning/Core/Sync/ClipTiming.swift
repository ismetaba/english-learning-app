import Foundation

// STUB — API contract only. Implementation pending (see ClipTimingTests).

/// Media-time range the player should play for a clip.
struct PlaybackWindow: Equatable {
    let start: Double
    let end: Double
    var duration: Double { end - start }
}

enum ClipTiming {
    static let minimumWordDuration: Double = 0.04

    /// Normalizes server timing so the sync invariants hold.
    static func sanitize(_ clip: LessonClip) -> LessonClip { clip }

    static func sanitize(_ line: ClipLine) -> ClipLine { line }

    /// Window that plays every displayed line in full.
    static func playbackWindow(for clip: LessonClip, padding: Double = 0.3) -> PlaybackWindow {
        PlaybackWindow(start: clip.startTime, end: clip.endTime)
    }
}

enum PrimaryClip {
    /// The one clip a set plays per video.
    static func pick(_ clips: [LessonClip]) -> LessonClip? { clips.first }
}
