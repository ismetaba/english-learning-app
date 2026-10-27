import SwiftUI
import UIKit
import WebKit

/// Hosts a `YouTubePlayerController`'s player page in a WKWebView. All
/// control and every event go through the controller; this view only owns
/// the web view's lifetime.
struct YouTubePlayerView: UIViewRepresentable {
    /// Owned by the screen (e.g. `@StateObject`, which it needs anyway to
    /// observe `state`/`errorCode`); the view only borrows it.
    let controller: YouTubePlayerController

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController = context.coordinator.contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.navigationDelegate = context.coordinator
        context.coordinator.bind(controller, to: web)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        // No-op unless a different controller was passed in.
        context.coordinator.bind(controller, to: web)
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        coordinator.teardown(web)
    }

    /// Page for a single clip, as the controller builds it (used by the
    /// live embed integration test).
    static func makeHTML(videoId: String, start: Double, end: Double?, autoplay: Bool) -> String {
        YouTubeEmbedHTML.make(source: PlayerSource(videoId: videoId, start: start, end: end, autoplay: autoplay))
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let contentController: WKUserContentController
        private let messageProxy: ScriptMessageProxy
        private weak var controller: YouTubePlayerController?

        override init() {
            contentController = WKUserContentController()
            messageProxy = ScriptMessageProxy()
            super.init()
            contentController.add(messageProxy, name: YouTubeEmbedHTML.messageHandlerName)
        }

        func bind(_ controller: YouTubePlayerController, to web: WKWebView) {
            guard controller !== self.controller else { return }
            self.controller?.detach(web)
            self.controller = controller
            messageProxy.target = controller
            controller.attach(web)
        }

        func teardown(_ web: WKWebView) {
            controller?.detach(web)
            controller = nil
            messageProxy.target = nil
            contentController.removeScriptMessageHandler(forName: YouTubeEmbedHTML.messageHandlerName)
            web.navigationDelegate = nil
            web.stopLoading()
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            controller?.webContentProcessDidTerminate(webView)
        }
    }
}

/// `WKUserContentController` retains its handlers strongly; routing the
/// page's messages through this weak hop keeps a web view from keeping its
/// controller alive.
@MainActor
private final class ScriptMessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: YouTubePlayerController?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.receive(message.body, from: message.webView)
    }
}
