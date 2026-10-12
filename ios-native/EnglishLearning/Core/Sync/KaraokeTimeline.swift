import Foundation

// STUB — API contract only. Implementation pending (see KaraokeTimelineTests).

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

    var activeWordIndex: Int? { nil }

    func phase(ofWord wordIndex: Int, inLine lineIndex: Int) -> WordPhase { .upcoming }

    func phase(ofWords range: ClosedRange<Int>, inLine lineIndex: Int) -> WordPhase { .upcoming }
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

    func position(at t: Double) -> SyncPosition { .none }
}
