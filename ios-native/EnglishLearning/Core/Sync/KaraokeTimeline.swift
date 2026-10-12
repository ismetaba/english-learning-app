import Foundation

enum WordPhase: Equatable {
    case past, active, upcoming
}

/// Where the karaoke is: which subtitle line is on screen and how far into
/// it the speaker is. Indices are positions in `ClipLine.words` (array
/// order), not the server's `wordIndex`.
struct SyncPosition: Equatable {
    enum LineProgress: Equatable {
        /// Line is current but its first word hasn't started yet.
        case notStarted
        /// The word at this array index owns the highlight.
        case speaking(Int)
        /// The line's audio is over (silence before the next line).
        case finished
    }

    var lineIndex: Int?
    var progress: LineProgress

    static let none = SyncPosition(lineIndex: nil, progress: .notStarted)

    var activeWordIndex: Int? {
        if case .speaking(let i) = progress { return i }
        return nil
    }

    func phase(ofWord wordIndex: Int, inLine lineIndex: Int) -> WordPhase {
        phase(ofWords: wordIndex...wordIndex, inLine: lineIndex)
    }

    /// Phase of a multi-word cell (phrasal verb, split contraction): it is
    /// active while any of its words is, and past only once all of them are.
    func phase(ofWords range: ClosedRange<Int>, inLine lineIndex: Int) -> WordPhase {
        guard let current = self.lineIndex else { return .upcoming }
        if lineIndex < current { return .past }
        if lineIndex > current { return .upcoming }
        switch progress {
        case .notStarted: return .upcoming
        case .finished: return .past
        case .speaking(let i):
            if range.contains(i) { return .active }
            return range.upperBound < i ? .past : .upcoming
        }
    }
}

/// Maps a media time to a `SyncPosition` for a list of (sanitized) lines.
struct KaraokeTimeline: Equatable {
    /// Highlight this much ahead of the reported time to hide the
    /// WebView → Swift → render latency.
    static let defaultLead: Double = 0.05

    let lines: [ClipLine]
    let lead: Double

    init(lines: [ClipLine], lead: Double = KaraokeTimeline.defaultLead) {
        self.lines = lines
        self.lead = lead
    }

    /// Runs every display frame, hence binary searches over the (sorted)
    /// lines and words.
    func position(at t: Double) -> SyncPosition {
        let tt = t + lead
        // The last started line stays on screen through the silence after
        // it, so subtitles don't blink off between sentences.
        guard let lineIndex = lines.lastIndex(startingAtOrBefore: tt, start: \.startTime) else {
            return .none
        }
        let line = lines[lineIndex]
        if tt > line.endTime {
            return SyncPosition(lineIndex: lineIndex, progress: .finished)
        }
        // Sticky: a word keeps the highlight through the gap before the
        // next one instead of blinking off for a frame.
        guard let wordIndex = line.words.lastIndex(startingAtOrBefore: tt, start: \.startTime) else {
            return SyncPosition(lineIndex: lineIndex, progress: .notStarted)
        }
        return SyncPosition(lineIndex: lineIndex, progress: .speaking(wordIndex))
    }
}

private extension Array {
    /// Index of the last element whose start is ≤ `t`, or nil if none.
    /// The array must be sorted by `start`.
    func lastIndex(startingAtOrBefore t: Double, start: (Element) -> Double) -> Int? {
        var low = 0, high = count
        while low < high {
            let mid = (low + high) / 2
            if start(self[mid]) <= t { low = mid + 1 } else { high = mid }
        }
        return low > 0 ? low - 1 : nil
    }
}
