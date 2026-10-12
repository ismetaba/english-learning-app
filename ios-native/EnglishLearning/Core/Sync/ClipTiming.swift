import Foundation

/// Media-time range the player should play for a clip.
struct PlaybackWindow: Equatable {
    let start: Double
    let end: Double
    var duration: Double { end - start }
}

enum ClipTiming {
    /// Shortest word duration we keep; the aligner emits zero-length and
    /// inverted (end before start) words.
    static let minimumWordDuration: Double = 0.04

    /// Normalizes server timing so the sync invariants hold: lines sorted
    /// by start, each line's words sorted, unique and inside the line.
    /// Never drops a line — every subtitle the server sent stays visible.
    static func sanitize(_ clip: LessonClip) -> LessonClip {
        let lines = clip.lines
            .map(sanitize)
            .enumerated()
            .sorted { ($0.element.startTime, $0.offset) < ($1.element.startTime, $1.offset) }
            .map(\.element)
        return LessonClip(id: clip.id, youtubeVideoId: clip.youtubeVideoId, movieTitle: clip.movieTitle,
                          startTime: clip.startTime, endTime: clip.endTime, lines: lines)
    }

    /// Word timing comes from a separate alignment pass than the subtitle
    /// line, so words can spill over the line's edges, arrive unsorted or
    /// be duplicated.
    ///
    /// Words that overlap the line widen it: their edges are what the audio
    /// actually does. Words that don't touch the line at all were aligned
    /// to another line's audio (dukes-of-hazzard: a run of "No!" lines,
    /// each carrying the previous line's word) and are pinned to the line's
    /// edge instead — stretching the line over its neighbour would start
    /// both at the same instant and that neighbour would never be shown.
    static func sanitize(_ line: ClipLine) -> ClipLine {
        var seenIndices = Set<Int>()
        let words = line.words
            .filter { w in
                guard w.startTime.isFinite, w.endTime.isFinite else { return false }
                guard let index = w.wordIndex else { return true }
                return seenIndices.insert(index).inserted
            }
            .map { w in retimed(w, start: w.startTime, end: w.endTime) }

        let lineEnd = max(line.endTime, line.startTime)
        let touching = words.filter { $0.endTime >= line.startTime && $0.startTime <= lineEnd }
        let lo = min(line.startTime, touching.map(\.startTime).min() ?? line.startTime)
        let hi = max(lineEnd, touching.map(\.endTime).max() ?? lineEnd)

        let sorted = words
            .map { w -> ClipWord in
                let start = min(max(w.startTime, lo), hi)
                return retimed(w, start: start, end: min(w.endTime, hi))
            }
            .enumerated()
            .sorted { a, b in
                // Offset last keeps the sort stable for equal keys.
                (a.element.startTime, a.element.wordIndex ?? .max, a.offset)
                    < (b.element.startTime, b.element.wordIndex ?? .max, b.offset)
            }
            .map(\.element)

        // A word pinned to the end gets the minimum duration past `hi`.
        let end = max(hi, sorted.map(\.endTime).max() ?? hi)
        return ClipLine(id: line.id, speaker: line.speaker, text: line.text,
                        translationTr: line.translationTr, startTime: lo, endTime: end,
                        isTarget: line.isTarget, structure: line.structure, words: sorted)
    }

    /// `w` moved to `start`, lasting at least `minimumWordDuration`.
    private static func retimed(_ w: ClipWord, start: Double, end: Double) -> ClipWord {
        ClipWord(word: w.word, startTime: start, endTime: max(end, start + minimumWordDuration),
                 wordIndex: w.wordIndex, starterId: w.starterId,
                 starterTr: w.starterTr, translationTr: w.translationTr)
    }

    /// Window that plays every displayed line in full. The backend returns
    /// lines within ±5s of the clip bounds, so the raw bounds can cut the
    /// first or last sentence mid-word. Expects a sanitized clip (lines
    /// covering their words).
    ///
    /// `trimSilence` (set playback) also cuts dead air the curated bounds
    /// leave around the dialogue: playback starts at most `maxLeadSilence`
    /// before the first line and stops at most `maxTailSilence` after the
    /// last one (storks: 0-203s became 8.8-177.5s). Within those limits the
    /// curated bounds still win.
    static func playbackWindow(for clip: LessonClip, padding: Double = 0.3,
                               trimSilence: Bool = false) -> PlaybackWindow {
        guard let firstStart = clip.lines.map(\.startTime).min(),
              let lastEnd = clip.lines.map(\.endTime).max()
        else { return PlaybackWindow(start: clip.startTime, end: clip.endTime) }
        var start = min(clip.startTime, firstStart - padding)
        var end = max(clip.endTime, lastEnd + padding)
        if trimSilence {
            start = max(start, firstStart - maxLeadSilence)
            end = min(end, lastEnd + maxTailSilence)
        }
        return PlaybackWindow(start: max(0, start), end: end)
    }

    /// Longest silence a trimmed window keeps before the first line.
    static let maxLeadSilence: Double = 3.0
    /// Longest silence a trimmed window keeps after the last line: enough
    /// to land the sentence, short of YouTube's own end screen.
    static let maxTailSilence: Double = 1.5
}

enum PrimaryClip {
    /// A scene this short (as the set plays it, trimmed) is "short".
    static let shortSceneMaxDuration: Double = 150
    /// ...as long as it has at least this many lines of dialogue.
    static let shortSceneMinLines = 8

    /// The one clip a set plays per video. The backend returns several
    /// curations of the same scene. A short scene with enough dialogue
    /// wins (the set promises short scenes; the longest cuts ran 4-7
    /// minutes with up to 36s of silent tail). Otherwise the one with the
    /// most tagged lines shows the most colored dialogue (the longest often
    /// had a sparser whisper pass). Equal density goes to the shorter cut.
    static func pick(_ clips: [LessonClip]) -> LessonClip? {
        var best: (clip: LessonClip, rank: Rank)?
        for clip in clips {
            let rank = Rank(clip)
            // Strictly better only: among equals the first one stays.
            if best.map({ rank > $0.rank }) ?? true { best = (clip, rank) }
        }
        return best?.clip
    }

    private struct Rank: Comparable {
        let isShortScene: Bool
        let lineCount: Int
        /// Trimmed playback length, then the curated length: shorter ranks higher.
        let playedDuration: Double
        let duration: Double

        init(_ clip: LessonClip) {
            let window = ClipTiming.playbackWindow(for: ClipTiming.sanitize(clip), trimSilence: true)
            lineCount = clip.lines.count
            isShortScene = window.duration <= PrimaryClip.shortSceneMaxDuration
                && lineCount >= PrimaryClip.shortSceneMinLines
            playedDuration = window.duration
            duration = clip.duration
        }

        static func < (a: Rank, b: Rank) -> Bool {
            if a.isShortScene != b.isShortScene { return !a.isShortScene }
            if a.lineCount != b.lineCount { return a.lineCount < b.lineCount }
            if a.playedDuration != b.playedDuration { return a.playedDuration > b.playedDuration }
            return a.duration > b.duration
        }
    }
}
