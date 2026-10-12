import Foundation

// STUB — API contract only. Implementation pending (see PlayerProtocolTests
// and Tools/PlayerHarness).

/// What the player should load: a YouTube video and the media window to
/// play inside it.
struct PlayerSource: Equatable {
    var videoId: String
    var start: Double
    var end: Double?
    var autoplay: Bool = true
    var loop: Bool = false
}

/// YouTube IFrame API player states.
enum PlayerState: Int, Equatable {
    case unstarted = -1
    case ended = 0
    case playing = 1
    case paused = 2
    case buffering = 3
    case cued = 5
}

/// Swift → page commands.
enum PlayerCommand: Equatable {
    case load(PlayerSource)
    case play
    case pause
    case seek(Double)
    /// Moves the clip window without reloading the video (loop a line,
    /// then go back to the whole clip).
    case setBounds(start: Double, end: Double?, loop: Bool)
    case setRate(Double)
    case setMuted(Bool)

    /// JS statement handing this command to the page.
    var javaScript: String { "" }
}

/// Page → Swift events.
enum PlayerEvent: Equatable {
    /// Page script is parsed; it accepts (and queues) commands from now on.
    case bridgeReady
    /// The YouTube player itself is ready.
    case ready
    case state(PlayerState)
    case time(Double, isPlaying: Bool)
    /// The clip window's end was reached (fired once per load/seek).
    case clipEnded(Double)
    case error(Int)

    static func parse(_ body: Any) -> PlayerEvent? { nil }
}

/// Learner-facing text for YouTube player errors (Turkish UI).
enum YouTubeError {
    /// Code used when the player never became ready.
    static let loadTimeoutCode = -1

    static func message(forCode code: Int) -> String { "" }
}

extension YouTubeEmbedHTML {
    static func make(source: PlayerSource, rate: Double = 1, muted: Bool = false) -> String {
        make(videoId: source.videoId, start: source.start, end: source.end, autoplay: source.autoplay)
    }
}
