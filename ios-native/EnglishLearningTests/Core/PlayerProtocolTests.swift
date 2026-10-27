import XCTest
@testable import EnglishLearning

/// Swift side of the WKWebView <-> YouTube page protocol. The JS side is
/// exercised in Chromium by Tools/PlayerHarness.
final class PlayerProtocolTests: XCTestCase {

    private func jsonPayload(_ js: String) throws -> [String: Any] {
        // Commands are `window.__player.exec(<json>)` (optionally guarded);
        // pull out the JSON object literal and decode it.
        let open = try XCTUnwrap(js.firstIndex(of: "{"))
        let close = try XCTUnwrap(js.lastIndex(of: "}"))
        let data = Data(js[open...close].utf8)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Commands

    func test_loadCarriesFractionalBoundsAndOptions() throws {
        let cmd = PlayerCommand.load(PlayerSource(videoId: "kzZQYnvw-6E", start: 10.6, end: 14.7, autoplay: true, loop: false))
        let js = cmd.javaScript
        XCTAssertTrue(js.contains("__player"), js)
        let p = try jsonPayload(js)
        XCTAssertEqual(p["type"] as? String, "load")
        XCTAssertEqual(p["videoId"] as? String, "kzZQYnvw-6E")
        XCTAssertEqual((p["start"] as? NSNumber)?.doubleValue ?? -1, 10.6, accuracy: 1e-9)
        XCTAssertEqual((p["end"] as? NSNumber)?.doubleValue ?? -1, 14.7, accuracy: 1e-9)
        XCTAssertEqual(p["autoplay"] as? Bool, true)
        XCTAssertEqual(p["loop"] as? Bool, false)
    }

    func test_openEndedLoadSendsNullEnd() throws {
        let p = try jsonPayload(PlayerCommand.load(PlayerSource(videoId: "x", start: 0, end: nil)).javaScript)
        XCTAssertTrue(p["end"] is NSNull)
        XCTAssertEqual(p["autoplay"] as? Bool, true, "autoplay defaults to true")
        XCTAssertEqual(p["loop"] as? Bool, false, "loop defaults to false")
    }

    func test_videoIdIsAlwaysASafeLiteral() throws {
        // A hostile/odd id must never break out of the JS string.
        let id = "a'b\"c\\d</script>"
        let p = try jsonPayload(PlayerCommand.load(PlayerSource(videoId: id, start: 1, end: 2)).javaScript)
        XCTAssertEqual(p["videoId"] as? String, id)
    }

    func test_simpleCommands() throws {
        XCTAssertEqual(try jsonPayload(PlayerCommand.play.javaScript)["type"] as? String, "play")
        XCTAssertEqual(try jsonPayload(PlayerCommand.pause.javaScript)["type"] as? String, "pause")

        let seek = try jsonPayload(PlayerCommand.seek(36.561).javaScript)
        XCTAssertEqual(seek["type"] as? String, "seek")
        XCTAssertEqual((seek["t"] as? NSNumber)?.doubleValue ?? -1, 36.561, accuracy: 1e-9)

        let rate = try jsonPayload(PlayerCommand.setRate(0.75).javaScript)
        XCTAssertEqual(rate["type"] as? String, "setRate")
        XCTAssertEqual((rate["rate"] as? NSNumber)?.doubleValue ?? -1, 0.75, accuracy: 1e-9)

        let mute = try jsonPayload(PlayerCommand.setMuted(true).javaScript)
        XCTAssertEqual(mute["type"] as? String, "setMuted")
        XCTAssertEqual(mute["muted"] as? Bool, true)

        let bounds = try jsonPayload(PlayerCommand.setBounds(start: 20.5, end: 22.0, loop: true).javaScript)
        XCTAssertEqual(bounds["type"] as? String, "setBounds")
        XCTAssertEqual((bounds["start"] as? NSNumber)?.doubleValue ?? -1, 20.5, accuracy: 1e-9)
        XCTAssertEqual((bounds["end"] as? NSNumber)?.doubleValue ?? -1, 22.0, accuracy: 1e-9)
        XCTAssertEqual(bounds["loop"] as? Bool, true)
    }

    // MARK: - Events

    func test_parsesEveryEventKind() {
        XCTAssertEqual(PlayerEvent.parse(["kind": "bridge"]), .bridgeReady)
        XCTAssertEqual(PlayerEvent.parse(["kind": "ready"]), .ready)
        XCTAssertEqual(PlayerEvent.parse(["kind": "time", "t": 12.5, "playing": true]), .time(12.5, isPlaying: true))
        XCTAssertEqual(PlayerEvent.parse(["kind": "time", "t": NSNumber(value: 7), "playing": NSNumber(value: false)]),
                       .time(7, isPlaying: false))
        XCTAssertEqual(PlayerEvent.parse(["kind": "state", "s": 1]), .state(.playing))
        XCTAssertEqual(PlayerEvent.parse(["kind": "state", "s": NSNumber(value: 3)]), .state(.buffering))
        XCTAssertEqual(PlayerEvent.parse(["kind": "state", "s": -1]), .state(.unstarted))
        XCTAssertEqual(PlayerEvent.parse(["kind": "clipEnd", "t": 14.7]), .clipEnded(14.7))
        XCTAssertEqual(PlayerEvent.parse(["kind": "error", "code": 150]), .error(150))
    }

    func test_rejectsMalformedMessages() {
        XCTAssertNil(PlayerEvent.parse("nope"))
        XCTAssertNil(PlayerEvent.parse(["kind": "time"]))
        XCTAssertNil(PlayerEvent.parse(["kind": "state", "s": 42]))
        XCTAssertNil(PlayerEvent.parse(["kind": "error"]))
        XCTAssertNil(PlayerEvent.parse(["kind": "whatever"]))
    }

    // MARK: - Errors shown to the learner

    func test_errorMessagesAreTurkishAndActionable() {
        for code in [2, 5, 100, 101, 150, 152, -1] {
            let msg = YouTubeError.message(forCode: code)
            XCTAssertFalse(msg.isEmpty)
            XCTAssertFalse(msg.lowercased().contains("error"), "no raw English/technical text: \(msg)")
        }
        XCTAssertNotEqual(YouTubeError.message(forCode: 100), YouTubeError.message(forCode: -1),
                          "removed video vs. load timeout should read differently")
    }

    // MARK: - Page

    func test_pageEmbedsConfigWithFractionalTimes() {
        let html = YouTubeEmbedHTML.make(source: PlayerSource(videoId: "kzZQYnvw-6E", start: 10.6, end: 14.7, autoplay: false, loop: true),
                                         rate: 0.75, muted: true)
        XCTAssertTrue(html.contains("host:'https://www.youtube-nocookie.com'") || html.contains("host: 'https://www.youtube-nocookie.com'"))
        XCTAssertTrue(html.contains("https://www.youtube.com/iframe_api"))
        XCTAssertTrue(html.contains("kzZQYnvw-6E"))
        XCTAssertTrue(html.contains("10.6"), "start must not be floored to whole seconds")
        XCTAssertTrue(html.contains("14.7"), "end must not be floored to whole seconds")
        XCTAssertTrue(html.contains("0.75"))
        XCTAssertTrue(html.contains("onError"))
    }

    func test_legacyWrapperStillBuildsAPage() {
        let html = YouTubeEmbedHTML.make(videoId: "abc", start: 1.5, end: nil, autoplay: true)
        XCTAssertTrue(html.contains("abc"))
        XCTAssertTrue(html.contains("1.5"))
    }
}
