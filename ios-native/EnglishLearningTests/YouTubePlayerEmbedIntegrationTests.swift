import XCTest
import WebKit
@testable import EnglishLearning

/// Live integration test: loads the exact HTML that YouTubePlayerView ships into a
/// real WKWebView on the simulator and waits to see whether YouTube's IFrame API
/// fires `onReady` (success) or `onError` (playback blocked).
///
/// This test actually hits YouTube over the network, so it requires the simulator
/// to have connectivity. It is the closest thing to a runtime proof that the
/// embed plays the problematic Despicable Me clip `z8VDANXnJjc`.
final class YouTubePlayerEmbedIntegrationTests: XCTestCase {
    @MainActor
    func test_despicableMeClipLoadsWithoutEmbedError() async throws {
        let videoId = "z8VDANXnJjc"
        let html = YouTubePlayerView.makeHTML(videoId: videoId, start: 0, end: 30, autoplay: true)

        let handler = BridgeHandler()
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(handler, name: "ytBridge")
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let host = UIWindow(frame: UIScreen.main.bounds)
        let web = WKWebView(frame: host.bounds, configuration: config)
        host.addSubview(web)
        host.isHidden = false
        host.makeKeyAndVisible()

        web.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))

        let outcome = await handler.waitForOutcome(timeout: 20)

        // Surface diagnostic DOM state on failure.
        if case .timeout = outcome {
            if let domDump: String = try? await evaluate(js: "document.body ? document.body.innerText.slice(0,500) : 'no body'", on: web) {
                XCTFail("Embed never signalled ready or error within 20s. DOM preview: \(domDump)")
            } else {
                XCTFail("Embed never signalled ready or error within 20s (no DOM).")
            }
            return
        }

        if case .error(let code) = outcome {
            XCTFail("YouTube IFrame API reported onError(\(code)) for video \(videoId). 150/101 = embed disabled; 152 = content blocked.")
            return
        }

        // .ready — success.
        XCTAssertTrue(true, "Embed fired onReady for \(videoId).")
    }

    private func evaluate(js: String, on web: WKWebView) async throws -> String? {
        try await withCheckedThrowingContinuation { cont in
            web.evaluateJavaScript(js) { value, error in
                if let error = error { cont.resume(throwing: error); return }
                cont.resume(returning: value as? String)
            }
        }
    }
}

private enum EmbedOutcome {
    case ready
    case error(Int)
    case timeout
}

private final class BridgeHandler: NSObject, WKScriptMessageHandler {
    private var continuation: CheckedContinuation<EmbedOutcome, Never>?
    private var finished = false
    private let lock = NSLock()

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "ytBridge",
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }
        switch kind {
        case "ready":
            finish(with: .ready)
        case "error":
            let code = (body["data"] as? Int) ?? (body["data"] as? NSNumber)?.intValue ?? -1
            finish(with: .error(code))
        default:
            break
        }
    }

    @MainActor
    func waitForOutcome(timeout: TimeInterval) async -> EmbedOutcome {
        await withCheckedContinuation { (cont: CheckedContinuation<EmbedOutcome, Never>) in
            lock.lock()
            continuation = cont
            lock.unlock()

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
                self?.finish(with: .timeout)
            }
        }
    }

    private func finish(with outcome: EmbedOutcome) {
        lock.lock()
        guard !finished, let cont = continuation else { lock.unlock(); return }
        finished = true
        continuation = nil
        lock.unlock()
        cont.resume(returning: outcome)
    }
}
