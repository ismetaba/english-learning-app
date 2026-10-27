import Foundation

// PROTOCOL v2 between the app and its YouTube player page
// (`YouTubeEmbedHTML`; exercised in Chromium by Tools/PlayerHarness).
//
//   Swift → page  `window.__player&&window.__player.exec(<json>)`, `type` =
//                 load{videoId,start,end|null,autoplay,loop} | play | pause |
//                 seek{t} | setBounds{start,end|null,loop} | setRate{rate} |
//                 setMuted{muted}
//   page → Swift  postMessage to `ytBridge`, `kind` = bridge | ready |
//                 time{t,playing} | state{s} | clipEnd{t} | loop{t} |
//                 error{code}
//
// The page owns the clip window: it stops (or loops) at `end` itself and
// reports `clipEnd` once, so a clip's ending never depends on Swift
// catching a late tick. Each loop wrap back to the window start `t` is a
// `loop`, not a `time` tick: a short loop's step back would pass for tick
// jitter.

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

    /// JS statement handing this command to the page. Guarded so a command
    /// racing a page (re)load is dropped instead of throwing.
    var javaScript: String { "window.__player&&window.__player.exec(\(payload.source));" }

    /// Tears the page's player down (timers, iframe) before its web view goes.
    static let destroyJavaScript = "window.__player&&window.__player.destroy();"

    /// The command as the JSON object the page's `exec` receives.
    var payload: JSLiteral {
        switch self {
        case .load(let source):
            return .object([
                ("type", .string("load")),
                ("videoId", .string(source.videoId)),
                ("start", .number(source.start)),
                ("end", source.end.map(JSLiteral.number) ?? .null),
                ("autoplay", .bool(source.autoplay)),
                ("loop", .bool(source.loop)),
            ])
        case .play:
            return .object([("type", .string("play"))])
        case .pause:
            return .object([("type", .string("pause"))])
        case .seek(let t):
            return .object([("type", .string("seek")), ("t", .number(t))])
        case .setBounds(let start, let end, let loop):
            return .object([
                ("type", .string("setBounds")),
                ("start", .number(start)),
                ("end", end.map(JSLiteral.number) ?? .null),
                ("loop", .bool(loop)),
            ])
        case .setRate(let rate):
            return .object([("type", .string("setRate")), ("rate", .number(rate))])
        case .setMuted(let muted):
            return .object([("type", .string("setMuted")), ("muted", .bool(muted))])
        }
    }
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
    /// A looping window wrapped back to its start `t`: a new pass begins.
    case looped(Double)
    case error(Int)

    /// Decodes a `WKScriptMessage.body`; nil for anything malformed.
    static func parse(_ body: Any) -> PlayerEvent? {
        guard let message = body as? [String: Any], let kind = message["kind"] as? String else { return nil }
        switch kind {
        case "bridge":
            return .bridgeReady
        case "ready":
            return .ready
        case "time":
            guard let t = number(message["t"]) else { return nil }
            return .time(t, isPlaying: flag(message["playing"]) ?? false)
        case "state":
            guard let raw = integer(message["s"]), let state = PlayerState(rawValue: raw) else { return nil }
            return .state(state)
        case "clipEnd":
            guard let t = number(message["t"]) else { return nil }
            return .clipEnded(t)
        case "loop":
            guard let t = number(message["t"]) else { return nil }
            return .looped(t)
        case "error":
            guard let code = integer(message["code"]) else { return nil }
            return .error(code)
        default:
            return nil
        }
    }

    // WebKit hands JS numbers and booleans over as NSNumber; tests (and
    // Linux) pass plain Swift values.
    private static func number(_ value: Any?) -> Double? {
        let d: Double?
        switch value {
        case let n as NSNumber: d = n.doubleValue
        case let v as Double: d = v
        case let v as Int: d = Double(v)
        default: d = nil
        }
        guard let d, d.isFinite else { return nil }
        return d
    }

    private static func integer(_ value: Any?) -> Int? {
        number(value).flatMap { Int(exactly: $0) }
    }

    private static func flag(_ value: Any?) -> Bool? {
        switch value {
        case let b as Bool: return b
        case let n as NSNumber: return n.boolValue
        default: return nil
        }
    }
}

/// A JSON value written straight into JavaScript source: the commands the
/// app evaluates in the player page and the config embedded in it.
///
/// Objects are assembled by hand instead of `JSONSerialization`-encoding a
/// dictionary so keys keep a fixed order and numbers use Swift's shortest
/// round-trip form on every platform (`NSJSONSerialization` has printed
/// doubles with 17 significant digits, e.g. 14.7 as 14.699999999999999).
/// Strings still go through `JSONSerialization` for escaping.
enum JSLiteral {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case object([(key: String, value: JSLiteral)])

    /// Source text, safe to embed inside an inline `<script>` element.
    var source: String {
        switch self {
        case .string(let s):
            return Self.quoted(s)
        case .number(let d):
            return d.isFinite ? "\(d)" : "null"
        case .bool(let b):
            return b ? "true" : "false"
        case .null:
            return "null"
        case .object(let members):
            return "{" + members.map { Self.quoted($0.key) + ":" + $0.value.source }.joined(separator: ",") + "}"
        }
    }

    private static func quoted(_ s: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed])) ?? Data("\"\"".utf8)
        return String(decoding: data, as: UTF8.self)
            // `</script>` or `<!--` inside a value must never end or derail
            // the inline script that embeds it.
            .replacingOccurrences(of: "<", with: "\\u003c")
            // Line terminators inside string literals before ES2019.
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }
}

/// Learner-facing text for YouTube player errors (Turkish UI).
enum YouTubeError {
    /// Code used when the player never became ready.
    static let loadTimeoutCode = -1

    /// Codes are the IFrame API's `onError` values, plus `loadTimeoutCode`.
    static func message(forCode code: Int) -> String {
        switch code {
        case 2:
            return "Video isteği geçersiz. Başka bir klip dene."
        case 5:
            return "Video oynatılırken bir sorun oldu. Tekrar dene."
        case 100:
            return "Bu video kaldırılmış ya da artık bulunamıyor."
        case 101, 150, 152:
            // Country and Content-ID blocks arrive with the same codes as
            // "embedding disabled", so don't blame the owner.
            return "Bu video Türkiye'de ya da uygulama içinde oynatılamıyor."
        case 153:
            // YouTube refused the in-app player itself (its embed setup,
            // e.g. a missing referrer), not this particular video.
            return "YouTube oynatıcısı bu videoyu uygulama içinde açamadı."
        case loadTimeoutCode:
            return "Video yüklenemedi. İnternet bağlantını kontrol edip tekrar dene."
        default:
            return "Bu video şu an oynatılamıyor."
        }
    }
}
