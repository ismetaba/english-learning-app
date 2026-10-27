import Foundation

/// What the "open scene" player shows for a sentence and where it starts.
struct ScenePlan: Equatable {
    /// Start a little before the sentence so its first word isn't clipped.
    static let leadIn: Double = 0.4
    /// Lines after the sentence the scene keeps playing…
    static let followingLines = 2
    /// …each starting within this many seconds of the sentence's end, so a
    /// pause ends the scene instead of running on into the next exchange.
    static let maxTail: Double = 6
    /// The context and clip endpoints can carry different line ids for the
    /// same subtitle; their start times agree.
    private static let sameLineTolerance: Double = 0.1

    let clip: LessonClip
    let startAt: Double

    /// Plays the sentence and the lines that follow it (up to
    /// `followingLines`, within `maxTail` seconds) when one of `videoClips`
    /// contains the sentence, otherwise just the sentence. Either way it
    /// starts at the sentence, not at the scene start, which can be minutes
    /// earlier, and stops soon after it instead of running to the end of
    /// the scene.
    static func make(context: VocabContext, videoClips: [LessonClip]?) -> ScenePlan {
        if let match = sceneLine(for: context, in: videoClips ?? []) {
            let scene = ClipTiming.sanitize(match.clip)
            if let index = scene.lines.firstIndex(where: { $0.id == match.line.id }) {
                let target = scene.lines[index]
                let following = scene.lines[(index + 1)...]
                    .prefix(followingLines)
                    .prefix { $0.startTime - target.endTime <= maxTail }
                return excerpt(of: scene, lines: [target] + following)
            }
        }
        // The context's clip bounds are its whole scene (and can even start
        // after its own sentence: 11.8s sentence, 27.1s "clip" start), so the
        // window is rebuilt around the sentence alone.
        let clip = ClipTiming.sanitize(context.asLessonClip())
        return excerpt(of: clip, lines: clip.lines)
    }

    /// `lines` of `clip` as a clip of their own, starting `leadIn` before
    /// the first: the playback window then ends with the last line.
    private static func excerpt(of clip: LessonClip, lines: [ClipLine]) -> ScenePlan {
        let start = max(0, (lines.first?.startTime ?? clip.startTime) - leadIn)
        let end = lines.last?.endTime ?? clip.endTime
        let trimmed = LessonClip(id: clip.id, youtubeVideoId: clip.youtubeVideoId, movieTitle: clip.movieTitle,
                                 startTime: start, endTime: end, lines: lines)
        return ScenePlan(clip: trimmed, startAt: start)
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
