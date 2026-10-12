import UIKit
import WebKit
import XCTest
@testable import EnglishLearning

/// Reproduces the YouTube "error 152 - This video is unavailable" bug observed in
/// the native iOS app when loading Despicable Me clip `z8VDANXnJjc`.
///
/// The bug: the embed HTML loads the IFrame API and origin from `www.youtube.com`,
/// which in WKWebView's `loadHTMLString(_:baseURL:)` context triggers YouTube's
/// embed restriction/privacy error overlay for many clips.
///
/// The fix characteristics these tests assert:
///   1. Embed HTML must use the privacy-enhanced `youtube-nocookie.com` domain.
///   2. Player must register an `onError` callback so the Swift layer can react.
///   3. The page forwards the error code over the bridge, where
///      `YouTubePlayerController` surfaces it (`errorCode`, `onEvent`) so
///      screens can show a fallback.
final class YouTubePlayerViewTests: XCTestCase {
    private let videoId = "z8VDANXnJjc" // Despicable Me clip that reproduces error 152

    func test_embedHTMLUsesNoCookieHostForPlayer() {
        let html = YouTubePlayerView.makeHTML(videoId: videoId, start: 0, end: 30, autoplay: true)
        // The YT.Player must be told to render the iframe on the nocookie domain
        // (this is what actually suppresses error 152 for restricted clips).
        XCTAssertTrue(
            html.contains("host:'https://www.youtube-nocookie.com'"),
            "YT.Player must set host to youtube-nocookie.com to avoid error 152."
        )
    }

    func test_embedHTMLLoadsIframeAPIFromYouTube() {
        let html = YouTubePlayerView.makeHTML(videoId: videoId, start: 0, end: 30, autoplay: true)
        // The IFrame API script is only served from www.youtube.com (nocookie 404s),
        // so the <script> src must point there even though the embed uses nocookie.
        XCTAssertTrue(
            html.contains("https://www.youtube.com/iframe_api"),
            "IFrame API must be loaded from www.youtube.com — nocookie returns 404 for /iframe_api."
        )
    }

    func test_embedHTMLOriginMatchesNoCookie() {
        let html = YouTubePlayerView.makeHTML(videoId: videoId, start: 0, end: 30, autoplay: true)
        XCTAssertTrue(
            html.contains("origin:'https://www.youtube-nocookie.com'"),
            "playerVars.origin must match the WKWebView baseURL (youtube-nocookie.com)."
        )
    }

    func test_embedHTMLRegistersPlayerErrorHandler() {
        let html = YouTubePlayerView.makeHTML(videoId: videoId, start: 0, end: 30, autoplay: true)
        XCTAssertTrue(
            html.contains("onError"),
            "Player must register an onError event handler so errors can bubble up."
        )
        XCTAssertTrue(
            html.contains("send('error', { code:"),
            "onError handler must forward the error code through the ytBridge."
        )
        XCTAssertEqual(PlayerEvent.parse(["kind": "error", "code": 152]), .error(152),
                       "the Swift side must decode the forwarded code")
    }
}

/// The load watchdog (`YouTubePlayerController.loadTimeout`) must not call
/// a good video broken: a set auto-skips whatever it reports as failed.
///  - Backgrounding the app mid-load used to fire an overdue timeout on
///    return, before the thawed page could report progress.
///  - A player that came up but starts slowly (slow network, long
///    buffering) used to get the same "Video yüklenemedi" error as a page
///    that never loaded.
final class YouTubePlayerWatchdogTests: XCTestCase {
    private let source = PlayerSource(videoId: "z8VDANXnJjc", start: 0, end: 30)
    private let timeout: TimeInterval = 0.2

    /// A web view whose page never loads, so nothing ever reports progress;
    /// the tests deliver page messages themselves.
    private final class SilentWebView: WKWebView {
        override func loadHTMLString(_ string: String, baseURL: URL?) -> WKNavigation? { nil }
    }

    /// The watchdog only judges a player that is on screen.
    @MainActor
    private func onScreenWebView() -> (WKWebView, UIWindow) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 180))
        let web = SilentWebView(frame: window.bounds, configuration: WKWebViewConfiguration())
        window.addSubview(web)
        XCTAssertNotNil(web.window)
        return (web, window)
    }

    @MainActor
    private func post(_ body: [String: Any], from web: WKWebView, to controller: YouTubePlayerController) {
        controller.receive(body, from: web)
    }

    /// Polls until `condition` holds; false if it doesn't within `limit`.
    @MainActor
    private func eventually(within limit: TimeInterval, _ condition: () -> Bool) async throws -> Bool {
        let deadline = Date().addingTimeInterval(limit)
        while !condition() {
            if Date() >= deadline { return false }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return true
    }

    @MainActor
    func test_backgroundingMidLoadIsNotAFailure() async throws {
        let center = NotificationCenter()
        let controller = YouTubePlayerController(source: source, notificationCenter: center)
        controller.loadTimeout = timeout
        let (web, window) = onScreenWebView()
        controller.attach(web)

        center.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        try await Task.sleep(nanoseconds: UInt64(timeout * 2 * 1_000_000_000))
        XCTAssertNil(controller.errorCode, "a load isn't judged while the app is in the background")

        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        let returned = Date()
        XCTAssertNil(controller.errorCode, "returning must not fire an overdue timeout")

        // A page that really never comes up is still reported, after a
        // full timeout counted from the return.
        let reported = try await eventually(within: 5) { controller.errorCode != nil }
        XCTAssertTrue(reported, "a load that never comes up must still be reported")
        XCTAssertEqual(controller.errorCode, YouTubeError.loadTimeoutCode)
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(returned), timeout - 0.02)
        XCTAssertFalse(controller.isSlowStart)

        controller.detach(web)
        window.isHidden = true
    }

    @MainActor
    func test_readyPlayerThatDoesNotStartIsSlowNotFailed() async throws {
        let controller = YouTubePlayerController(source: source, notificationCenter: NotificationCenter())
        controller.loadTimeout = timeout
        let (web, window) = onScreenWebView()
        controller.attach(web)
        post(["kind": "bridge"], from: web, to: controller)
        post(["kind": "ready"], from: web, to: controller)

        let slow = try await eventually(within: 5) { controller.isSlowStart }
        XCTAssertTrue(slow, "a ready player without progress shows the soft slow-start state")
        XCTAssertNil(controller.errorCode, "a player that came up is not a failed load")

        // It starts after all.
        post(["kind": "state", "s": PlayerState.playing.rawValue], from: web, to: controller)
        XCTAssertFalse(controller.isSlowStart)
        XCTAssertNil(controller.errorCode)

        // And a new load starts with a clean slate.
        try await Task.sleep(nanoseconds: UInt64(timeout * 2 * 1_000_000_000))
        XCTAssertFalse(controller.isSlowStart, "progress stopped the watchdog")
        controller.load(PlayerSource(videoId: "kzZQYnvw-6E", start: 10, end: 20))
        XCTAssertFalse(controller.isSlowStart)
        let slowAgain = try await eventually(within: 5) { controller.isSlowStart }
        XCTAssertTrue(slowAgain, "the next load gets its own watchdog")

        controller.detach(web)
        window.isHidden = true
    }
}
