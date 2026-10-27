import Foundation

/// What the "open scene" player shows for a sentence and where it starts.
struct ScenePlan: Equatable {
    /// Start a little before the sentence so its first word isn't clipped.
    static let leadIn: Double = 0.4
    /// The context and clip endpoints can carry different line ids for the
    /// same subtitle; their start times agree.
    private static let sameLineTolerance: Double = 0.1

    let clip: LessonClip
    let startAt: Double

    /// Opens the full scene (every subtitle line) when one of `videoClips`
    /// contains the sentence, otherwise just the sentence. Either way
    /// playback starts at the sentence, not at the scene start, which can
    /// be minutes earlier.
    static func make(context: VocabContext, videoClips: [LessonClip]?) -> ScenePlan {
        if let match = sceneLine(for: context, in: videoClips ?? []) {
            let clip = ClipTiming.sanitize(match.clip)
            let window = ClipTiming.playbackWindow(for: clip)
            let lineStart = ClipTiming.sanitize(match.line).startTime
            return ScenePlan(clip: clip, startAt: max(window.start, lineStart - leadIn))
        }
        // Not clamped to the playback window: a context's clip bounds can
        // start after its own sentence (11.8s sentence, 27.1s "clip" start),
        // and the window's 0.3s padding would eat into the lead-in.
        let clip = ClipTiming.sanitize(context.asLessonClip())
        return ScenePlan(clip: clip, startAt: max(0, context.startTime - leadIn))
    }

    /// The scene of the same video holding the sentence: by line id, else
    /// by start time. Matches against raw (unsanitized) lines because
    /// `context.startTime` is the raw subtitle start too.
    private static func sceneLine(for context: VocabContext,
                                  in clips: [LessonClip]) -> (clip: LessonClip, line: ClipLine)? {
        let sameVideo = clips.filter { $0.youtubeVideoId == context.youtubeVideoId }
        for clip in sameVideo {
            if let line = clip.lines.first(where: { $0.id == context.lineId }) { return (clip, line) }
        }
        for clip in sameVideo {
            if let line = clip.lines.first(where: { abs($0.startTime - context.startTime) <= sameLineTolerance }) {
                return (clip, line)
            }
        }
        return nil
    }
}

extension VocabContext {
    /// Media window a reel loops: the sentence plus a little air.
    func loopWindow(leadIn: Double = 0.4, leadOut: Double = 0.6) -> PlaybackWindow {
        PlaybackWindow(start: max(0, startTime - leadIn), end: endTime + leadOut)
    }

    /// The sentence as a sanitized `ClipLine`, ready for `KaraokeTimeline`.
    var syncLine: ClipLine { ClipTiming.sanitize(clipLine) }
}
