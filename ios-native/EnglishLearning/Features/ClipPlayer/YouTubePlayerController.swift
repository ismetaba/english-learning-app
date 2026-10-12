import Combine
import Foundation
import QuartzCore
import UIKit
import WebKit

/// Drives one YouTube player page (`YouTubeEmbedHTML`) hosted by a
/// `YouTubePlayerView`. Screens talk to this object, never to the web view.
///
/// Commands issued before the web view exists, or before its page can take
/// them, are queued in order and delivered as one batch once it can: a reel
/// that becomes visible while still loading still starts, and two commands
/// issued in the same tick both land. One controller drives one view at a
/// time.
@MainActor
final class YouTubePlayerController: ObservableObject {
    /// How long a load may go without the player becoming ready and making
    /// progress before the learner is told it failed.
    var loadTimeout: TimeInterval = 15

    @Published private(set) var state: PlayerState = .unstarted
    /// The YouTube player inside the page is up (it accepts commands
    /// directly from now on).
    @Published private(set) var isReady = false
    /// Last `onError` code, or `YouTubeError.loadTimeoutCode`. Cleared by
    /// `load` and `retry`.
    @Published private(set) var errorCode: Int?

    private(set) var source: PlayerSource?
    private(set) var rate: Double
    private(set) var isMuted: Bool

    /// Every page event in arrival order, with the host time
    /// (`CACurrentMediaTime()`) it was received at: the karaoke clock's
    /// time base.
    var onEvent: ((PlayerEvent, Double) -> Void)?

    private weak var webView: WKWebView?
    /// A page has been handed to `webView` (it may still be loading).
    private var hasPage = false
    /// The page's script runs and takes commands.
    private var bridgeReady = false
    private var pending: [PlayerCommand] = []
    private var watchdog: Task<Void, Never>?
    private var lastMediaTime: Double?
    /// Bumped by every page report of `isReady` / `state` (see `resetStatus`).
    private var readyRevision = 0
    private var stateRevision = 0

    private static let pageBaseURL = URL(string: YouTubeEmbedHTML.origin)

    init(source: PlayerSource? = nil, rate: Double = 1, muted: Bool = false) {
        self.source = source
        self.rate = rate
        self.isMuted = muted
    }

    // MARK: - Commands

    /// Plays `source`'s window (per its autoplay/loop). Before the view
    /// exists this only picks what its first page loads.
    func load(_ source: PlayerSource) {
        self.source = source
        clearError()
        lastMediaTime = nil
        // Whatever is still queued was meant for the previous source.
        pending.removeAll { $0.isSupersededByLoad }
        if hasPage {
            send(.load(source))
            armWatchdog()
        } else {
            loadPage()
        }
    }

    func play() { send(.play) }

    func pause() { send(.pause) }

    func seek(to time: Double) { send(.seek(time)) }

    /// Changes the clip window without reloading the video (loop one line,
    /// then go back to the whole clip).
    func setBounds(start: Double, end: Double?, loop: Bool) {
        send(.setBounds(start: start, end: end, loop: loop))
    }

    /// Survives later loads: the page re-applies it whenever playback starts.
    func setRate(_ rate: Double) {
        self.rate = rate
        // A page built later starts at this rate anyway.
        if hasPage { send(.setRate(rate)) }
    }

    func setMuted(_ muted: Bool) {
        isMuted = muted
        if hasPage { send(.setMuted(muted)) }
    }

    /// Loads the current source again, e.g. from an error screen.
    func retry() {
        guard let source else { return }
        clearError()
        lastMediaTime = nil
        if bridgeReady && isReady {
            send(.load(source))
            armWatchdog()
        } else {
            // The player itself never came up (offline, iframe_api blocked):
            // start over with a fresh page.
            loadPage()
        }
    }

    // MARK: - View plumbing (YouTubePlayerView)

    /// Takes over `webView` and gives it a page for the current source (if
    /// any yet; otherwise on the first `load`).
    func attach(_ webView: WKWebView) {
        guard self.webView !== webView else { return }
        if let current = self.webView { detach(current) }
        self.webView = webView
        loadPage()
    }

    /// Lets go of `webView`; its page tears the player down. Source, rate,
    /// mute and queued commands are kept: a view attached later starts the
    /// current source again.
    func detach(_ webView: WKWebView) {
        guard self.webView === webView else { return }
        if hasPage { webView.evaluateJavaScript(PlayerCommand.destroyJavaScript, completionHandler: nil) }
        self.webView = nil
        hasPage = false
        bridgeReady = false
        cancelWatchdog()
        resetStatus()
    }

    /// iOS reclaims a web view's content process under memory pressure
    /// (typically while backgrounded), leaving a black view behind. Rebuild
    /// the page, paused where the learner was.
    func webContentProcessDidTerminate(_ webView: WKWebView) {
        guard self.webView === webView else { return }
        loadPage(resumingAt: lastMediaTime)
    }

    /// A message the page posted to `YouTubeEmbedHTML.messageHandlerName`.
    /// Messages from a web view this controller has let go of are dropped.
    func receive(_ body: Any, from sender: WKWebView?) {
        let hostTime = CACurrentMediaTime()
        guard sender == nil || sender === webView, let event = PlayerEvent.parse(body) else { return }
        handle(event, at: hostTime)
    }

    // MARK: - Private

    private func handle(_ event: PlayerEvent, at hostTime: Double) {
        switch event {
        case .bridgeReady:
            bridgeReady = true
            flush()
        case .ready:
            readyRevision += 1
            if !isReady { isReady = true }
        case .state(let newState):
            stateRevision += 1
            if state != newState { state = newState }
            if newState.showsProgress { madeProgress() }
        case .time(let t, let isPlaying):
            lastMediaTime = t
            if isPlaying { madeProgress() }
        case .clipEnded(let t):
            lastMediaTime = t
            madeProgress()
        case .error(let code):
            cancelWatchdog()
            errorCode = code
        }
        onEvent?(event, hostTime)
    }

    private func send(_ command: PlayerCommand) {
        if bridgeReady, let webView {
            webView.evaluateJavaScript(command.javaScript, completionHandler: nil)
        } else {
            pending.append(command)
        }
    }

    /// Delivers the queue as one script, so the page runs it in one go.
    private func flush() {
        guard bridgeReady, let webView, !pending.isEmpty else { return }
        let script = pending.map(\.javaScript).joined(separator: "\n")
        pending.removeAll()
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    /// Hands the web view a fresh page for the current source. The page
    /// loads that source itself, so queued loads are dropped.
    private func loadPage(resumingAt time: Double? = nil) {
        guard let webView, var page = source else { return }
        pending.removeAll { if case .load = $0 { return true } else { return false } }
        if let time {
            page.autoplay = false
            pending.insert(.seek(time), at: 0)
        }
        hasPage = true
        bridgeReady = false
        resetStatus()
        webView.loadHTMLString(YouTubeEmbedHTML.make(source: page, rate: rate, muted: isMuted),
                               baseURL: Self.pageBaseURL)
        armWatchdog()
    }

    /// The page that reported `isReady`/`state` is gone. Published a turn
    /// later because attach/detach run inside SwiftUI view updates, which
    /// must not publish; a report from the new page in the meantime wins.
    private func resetStatus() {
        let readyMark = readyRevision
        let stateMark = stateRevision
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.readyRevision == readyMark, self.isReady { self.isReady = false }
            if self.stateRevision == stateMark, self.state != .unstarted { self.state = .unstarted }
        }
    }

    /// Assigning a `@Published` value notifies observers even when it is
    /// unchanged; don't do that on every load.
    private func clearError() {
        if errorCode != nil { errorCode = nil }
    }

    private func madeProgress() {
        cancelWatchdog()
        // It loaded after all.
        if errorCode == YouTubeError.loadTimeoutCode { errorCode = nil }
    }

    private func armWatchdog() {
        watchdog?.cancel()
        watchdog = nil
        guard webView != nil else { return }
        let nanoseconds = UInt64(max(0, loadTimeout) * 1_000_000_000)
        watchdog = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: nanoseconds)
            guard !Task.isCancelled else { return }
            self?.loadTimedOut()
        }
    }

    private func cancelWatchdog() {
        watchdog?.cancel()
        watchdog = nil
    }

    private func loadTimedOut() {
        watchdog = nil
        guard errorCode == nil, let webView else { return }
        // Off screen a page may legitimately make no progress; judge it
        // once it is shown.
        guard webView.window != nil else {
            armWatchdog()
            return
        }
        handle(.error(YouTubeError.loadTimeoutCode), at: CACurrentMediaTime())
    }
}

private extension PlayerState {
    /// The player got far enough with a load to show or play it.
    var showsProgress: Bool {
        switch self {
        case .playing, .paused, .cued, .ended: return true
        case .unstarted, .buffering: return false
        }
    }
}

private extension PlayerCommand {
    /// Only meaningful for the source loaded before them.
    var isSupersededByLoad: Bool {
        switch self {
        case .load, .play, .pause, .seek, .setBounds: return true
        case .setRate, .setMuted: return false
        }
    }
}
