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
    static func playbackWindow(for clip: LessonClip, padding: Double = 0.3) -> PlaybackWindow {
        guard let firstStart = clip.lines.map(\.startTime).min(),
              let lastEnd = clip.lines.map(\.endTime).max()
        else { return PlaybackWindow(start: clip.startTime, end: clip.endTime) }
        return PlaybackWindow(start: max(0, min(clip.startTime, firstStart - padding)),
                              end: max(clip.endTime, lastEnd + padding))
    }
}

enum PrimaryClip {
    /// The one clip a set plays per video. The backend returns several
    /// curations of the same scene; the one with the most tagged lines
    /// shows the most colored dialogue (the longest often had a sparser
    /// whisper pass). Duration breaks ties.
    static func pick(_ clips: [LessonClip]) -> LessonClip? {
        clips.max { a, b in
            if a.lines.count != b.lines.count { return a.lines.count < b.lines.count }
            return a.duration < b.duration
        }
    }
}
