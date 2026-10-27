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
    /// How long a load may go without making progress before the learner
    /// hears about it: an error if the player never came up, `isSlowStart`
    /// if it did. Counted in the foreground only.
    var loadTimeout: TimeInterval = 15

    @Published private(set) var state: PlayerState = .unstarted
    /// The YouTube player inside the page is up (it accepts commands
    /// directly from now on).
    @Published private(set) var isReady = false
    /// Last `onError` code, or `YouTubeError.loadTimeoutCode` (the player
    /// never came up within `loadTimeout`). Cleared by `load` and `retry`.
    /// A transient code (`YouTubeError.isTransient`) only lands here when
    /// the silent reload it gets first fails too.
    @Published private(set) var errorCode: Int?
    /// The player is up but the load hasn't started within `loadTimeout`
    /// (slow network, stuck buffering). Not an error: screens show a small
    /// "Video başlıyor…" chip with a manual skip and keep waiting. Cleared
    /// by progress, an error and the next load.
    @Published private(set) var isSlowStart = false

    private(set) var source: PlayerSource?
    private(set) var rate: Double
    private(set) var isMuted: Bool

    /// Every page event in arrival order, with the host time
    /// (`CACurrentMediaTime()`) it was received at: the karaoke clock's
    /// time base.
    var onEvent: ((PlayerEvent, Double) -> Void)?
    /// Runs a script in the page. Tests swap it to record what the page is
    /// told without starting WebKit's content process.
    var evaluate: @MainActor (WKWebView, String) -> Void = { web, script in
        web.evaluateJavaScript(script, completionHandler: nil)
    }

    private weak var webView: WKWebView?
    /// A page has been handed to `webView` (it may still be loading).
    private var hasPage = false
    /// The page's script runs and takes commands.
    private var bridgeReady = false
    private var pending: [PlayerCommand] = []
    private var watchdog: Task<Void, Never>?
    /// A load is waiting for its first progress (the watchdog's job, even
    /// while the watchdog is paused in the background).
    private var awaitingProgress = false
    /// False from resigning active until active again: a load isn't
    /// judged then, it gets a full timeout once the app is back in front.
    private var isAppActive = true
    private var lifecycle: Set<AnyCancellable> = []
    private var lastMediaTime: Double?
    /// The window last set with `setBounds` since the last `load`. A reload
    /// puts the page back on the source's own window, so retries and page
    /// rebuilds set this one again.
    private var bounds: PlayerCommand?
    /// Bumped by every page report of `isReady` / `state` (see `resetStatus`).
    private var readyRevision = 0
    private var stateRevision = 0
    /// A transient failure may still be reloaded once without the learner
    /// seeing it. Each `load` and each `retry` (Tekrar dene) get one: a
    /// failure that repeats right away is real.
    private var canRetrySilently = true
    /// Whether the screen wants the page playing: the loaded source's
    /// autoplay, then `play` / `pause`, until the window ends. A reload
    /// restarts the page from the source's autoplay instead, so a silent
    /// one must carry this over itself: a card that moved off screen or
    /// that the learner paused stays paused, one that was told to play
    /// plays on.
    private var wantsPlayback: Bool

    private static let pageBaseURL = URL(string: YouTubeEmbedHTML.origin)

    /// `notificationCenter` delivers the app lifecycle notifications
    /// (tests post their own).
    init(source: PlayerSource? = nil, rate: Double = 1, muted: Bool = false,
         notificationCenter: NotificationCenter = .default) {
        self.source = source
        self.rate = rate
        self.isMuted = muted
        self.wantsPlayback = source?.autoplay ?? false
        observeAppLifecycle(notificationCenter)
    }

    // MARK: - Commands

    /// Plays `source`'s window (per its autoplay/loop). Before the view
    /// exists this only picks what its first page loads.
    func load(_ source: PlayerSource) {
        self.source = source
        clearError()
        clearSlowStart()
        lastMediaTime = nil
        // A new clip has its own window, and its own silent retry.
        bounds = nil
        canRetrySilently = true
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
    /// then go back to the whole clip). Kept until the next `load`.
    func setBounds(start: Double, end: Double?, loop: Bool) {
        let command = PlayerCommand.setBounds(start: start, end: end, loop: loop)
        bounds = command
        send(command)
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

    /// Loads the current source again, e.g. from an error screen, in the
    /// window last set with `setBounds`.
    func retry() {
        guard let source else { return }
        // A fresh attempt: a transient failure on it is retried silently
        // again rather than put straight back on screen.
        canRetrySilently = true
        clearError()
        clearSlowStart()
        lastMediaTime = nil
        if bridgeReady && isReady {
            send(.load(source))
            armWatchdog()
        } else {
            // The player itself never came up (offline, iframe_api blocked):
            // start over with a fresh page.
            loadPage()
        }
        restoreBounds()
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
        if hasPage { evaluate(webView, PlayerCommand.destroyJavaScript) }
        self.webView = nil
        hasPage = false
        bridgeReady = false
        cancelWatchdog()
        awaitingProgress = false
        resetStatus()
    }

    /// iOS reclaims a web view's content process under memory pressure
    /// (typically while backgrounded), leaving a black view behind. Rebuild
    /// the page, paused where the learner was, in the window they were in.
    func webContentProcessDidTerminate(_ webView: WKWebView) {
        guard self.webView === webView else { return }
        loadPage(resumingAt: lastMediaTime)
        restoreBounds()
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
            // The page stopped at the window's end; a reload must not
            // replay it.
            wantsPlayback = false
            madeProgress()
        case .looped(let t):
            // A wrap is a new pass, not a stall.
            lastMediaTime = t
            madeProgress()
        case .error(let code):
            cancelWatchdog()
            awaitingProgress = false
            clearSlowStart()
            if !retryIfTransient(code) { errorCode = code }
        }
        // A silently retried error still stopped the player: the karaoke
        // clock stops with it until the reload plays.
        onEvent?(event, hostTime)
    }

    /// Loads the source again in place, once per load, instead of showing
    /// a transient failure (`YouTubeError.isTransient`); false when the
    /// error is the learner's to see. Like Tekrar dene, it reloads in the
    /// window last set with `setBounds`, then asks for playback again if
    /// the screen wanted it. Only a player that is up reports these codes,
    /// so the load goes to it rather than to a fresh page.
    private func retryIfTransient(_ code: Int) -> Bool {
        guard YouTubeError.isTransient(code), canRetrySilently,
              bridgeReady, isReady, var reload = source else { return false }
        canRetrySilently = false
        reload.autoplay = wantsPlayback
        lastMediaTime = nil
        send(.load(reload))
        armWatchdog()
        restoreBounds()
        if reload.autoplay { send(.play) }
        return true
    }

    private func send(_ command: PlayerCommand) {
        if let wants = command.playbackIntent { wantsPlayback = wants }
        if bridgeReady, let webView {
            evaluate(webView, command.javaScript)
        } else {
            pending.append(command)
        }
    }

    /// Delivers the queue as one script, so the page runs it in one go.
    private func flush() {
        guard bridgeReady, let webView, !pending.isEmpty else { return }
        let script = pending.map(\.javaScript).joined(separator: "\n")
        pending.removeAll()
        evaluate(webView, script)
    }

    /// Sets the screen's window again after a reload put the page back on
    /// the source's. Goes after the load, and on a rebuilt page after its
    /// resume seek: the page's `setBounds` keeps the playhead where it is,
    /// so it keeps the restored one. One still queued lands anyway.
    private func restoreBounds() {
        guard let bounds, !pending.contains(where: \.isSetBounds) else { return }
        send(bounds)
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
        // The page starts as `page` says, then takes the queued commands.
        wantsPlayback = pending.reduce(page.autoplay) { $1.playbackIntent ?? $0 }
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
            // A slow start belonged to the old page; a new one gets a full
            // timeout before it can be slow.
            self.clearSlowStart()
        }
    }

    /// Assigning a `@Published` value notifies observers even when it is
    /// unchanged; don't do that on every load.
    private func clearError() {
        if errorCode != nil { errorCode = nil }
    }

    private func clearSlowStart() {
        if isSlowStart { isSlowStart = false }
    }

    /// Runs on every playing tick: must stay cheap and publish nothing
    /// unless something changed.
    private func madeProgress() {
        cancelWatchdog()
        awaitingProgress = false
        clearSlowStart()
        // It loaded after all.
        if errorCode == YouTubeError.loadTimeoutCode { errorCode = nil }
    }

    private func armWatchdog() {
        watchdog?.cancel()
        watchdog = nil
        guard webView != nil else { return }
        awaitingProgress = true
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
        // Off screen or with the app not in front, a page may legitimately
        // make no progress; judge it once it is shown.
        guard webView.window != nil, isAppActive, UIApplication.shared.applicationState != .background else {
            armWatchdog()
            return
        }
        if isReady {
            // The player is up, the video just hasn't started (slow
            // network, long buffering): a good video, not a failure. Keep
            // waiting; progress clears it.
            if !isSlowStart { isSlowStart = true }
            return
        }
        // The player never came up. Should it still do so behind the error
        // screen, it must not start playing there. (Without a bridge there
        // is no page to tell, and a queued pause would outlive a retry.)
        if bridgeReady { send(.pause) }
        handle(.error(YouTubeError.loadTimeoutCode), at: CACurrentMediaTime())
    }

    /// Backgrounding suspends the page but not the watchdog's clock: an
    /// overdue timeout fired on return before the thawed page could report
    /// progress, and a set skipped a good video. So the watchdog stops in
    /// the background and starts a full timeout once the app is active.
    private func observeAppLifecycle(_ center: NotificationCenter) {
        center.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in self?.isAppActive = false }
            .store(in: &lifecycle)
        center.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in self?.appDidEnterBackground() }
            .store(in: &lifecycle)
        center.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in self?.appDidBecomeActive() }
            .store(in: &lifecycle)
    }

    private func appDidEnterBackground() {
        isAppActive = false
        cancelWatchdog()
    }

    private func appDidBecomeActive() {
        isAppActive = true
        if awaitingProgress, errorCode == nil { armWatchdog() }
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

    var isSetBounds: Bool {
        if case .setBounds = self { return true } else { return false }
    }

    /// Whether the page should play after this command; nil if it doesn't
    /// say.
    var playbackIntent: Bool? {
        switch self {
        case .load(let source): return source.autoplay
        case .play: return true
        case .pause: return false
        case .seek, .setBounds, .setRate, .setMuted: return nil
        }
    }
}
