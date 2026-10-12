import Foundation

// STUB — API contract only. Implementation pending (see ScenePlanTests).

/// What the "open scene" player shows for a sentence and where it starts.
struct ScenePlan: Equatable {
    static let leadIn: Double = 0.4

    let clip: LessonClip
    let startAt: Double

    static func make(context: VocabContext, videoClips: [LessonClip]?) -> ScenePlan {
        let clip = context.asLessonClip()
        return ScenePlan(clip: clip, startAt: clip.startTime)
    }
}

extension VocabContext {
    /// Media window a reel loops: the sentence plus a little air.
    func loopWindow(leadIn: Double = 0.4, leadOut: Double = 0.6) -> PlaybackWindow {
        PlaybackWindow(start: clipStartTime, end: clipEndTime)
    }

    /// The sentence as a sanitized `ClipLine`, ready for `KaraokeTimeline`.
    var syncLine: ClipLine { asLessonClip().lines[0] }
}
