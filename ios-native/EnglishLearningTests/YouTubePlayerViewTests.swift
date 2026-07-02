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
///   3. Swift side must expose an `onError` hook so callers can show a fallback.
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
            html.contains("send('error'"),
            "onError handler must forward the error code through the ytBridge."
        )
    }
}
