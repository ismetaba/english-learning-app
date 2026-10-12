import SwiftUI
import WebKit

/// Wraps the YouTube IFrame API inside a WKWebView and exposes imperative controls +
/// a time-update callback sent at 250ms cadence from the page.
struct YouTubePlayerView: UIViewRepresentable {
    let videoId: String
    var startTime: Double = 0
    var endTime: Double? = nil
    var autoplay: Bool = true
    @Binding var isPlaying: Bool
    var currentTime: ((Double) -> Void)? = nil
    var onReady: (() -> Void)? = nil
    var onEnded: (() -> Void)? = nil
    var onError: ((Int) -> Void)? = nil

    @Binding var command: PlayerCommand?

    enum PlayerCommand: Equatable {
        case play
        case pause
        case seek(Double)
        case loop(Double, Double)
        case reload
        case setSpeed(Double)
        case setMuted(Bool)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "ytBridge")
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.navigationDelegate = context.coordinator
        context.coordinator.webView = web

        let html = Self.makeHTML(videoId: videoId, start: startTime, end: endTime, autoplay: autoplay)
        web.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if let cmd = command {
            context.coordinator.send(cmd)
            DispatchQueue.main.async { self.command = nil }
        }
    }

    // MARK: - HTML

    static func makeHTML(videoId: String, start: Double, end: Double?, autoplay: Bool) -> String {
        YouTubeEmbedHTML.make(videoId: videoId, start: start, end: end, autoplay: autoplay)
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let parent: YouTubePlayerView
        weak var webView: WKWebView?
        init(_ parent: YouTubePlayerView) { self.parent = parent }

        func send(_ cmd: PlayerCommand) {
            guard let web = webView else { return }
            let js: String
            switch cmd {
            case .play:             js = "window.__cmd({ type: 'play' });"
            case .pause:            js = "window.__cmd({ type: 'pause' });"
            case .seek(let t):      js = "window.__cmd({ type: 'seek', t: \(t) });"
            case .loop(let a, _):   js = "window.__cmd({ type: 'loop', a: \(a) });"
            case .reload:           js = "window.__cmd({ type: 'reload' });"
            case .setSpeed(let r):  js = "window.__cmd({ type: 'setSpeed', r: \(r) });"
            case .setMuted(let m):  js = "window.__cmd({ type: 'setMuted', m: \(m) });"
            }
            web.evaluateJavaScript(js, completionHandler: nil)
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "ytBridge",
                  let body = message.body as? [String: Any],
                  let kind = body["kind"] as? String else { return }
            switch kind {
            case "ready":
                DispatchQueue.main.async { self.parent.onReady?() }
            case "time":
                if let t = body["data"] as? Double {
                    DispatchQueue.main.async { self.parent.currentTime?(t) }
                } else if let n = body["data"] as? NSNumber {
                    DispatchQueue.main.async { self.parent.currentTime?(n.doubleValue) }
                }
            case "state":
                if let s = body["data"] as? Int {
                    DispatchQueue.main.async { self.parent.isPlaying = (s == 1) }
                } else if let n = body["data"] as? NSNumber {
                    DispatchQueue.main.async { self.parent.isPlaying = (n.intValue == 1) }
                }
            case "ended":
                DispatchQueue.main.async { self.parent.onEnded?() }
            case "error":
                if let code = body["data"] as? Int {
                    DispatchQueue.main.async { self.parent.onError?(code) }
                } else if let n = body["data"] as? NSNumber {
                    DispatchQueue.main.async { self.parent.onError?(n.intValue) }
                }
            default:
                break
            }
        }
    }
}
