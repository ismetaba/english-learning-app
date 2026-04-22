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

    @Binding var command: PlayerCommand?

    enum PlayerCommand: Equatable {
        case play
        case pause
        case seek(Double)
        case loop(Double, Double)
        case reload
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
        web.loadHTMLString(html, baseURL: URL(string: "https://www.youtube.com"))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if let cmd = command {
            context.coordinator.send(cmd)
            DispatchQueue.main.async { self.command = nil }
        }
    }

    // MARK: - HTML

    private static func makeHTML(videoId: String, start: Double, end: Double?, autoplay: Bool) -> String {
        let startSec = String(Int(start))
        let endSec: String = end.map { String(Int($0)) } ?? "null"
        let endPlayerVar: String = end.map { "end: \(Int($0))," } ?? ""
        let autoplayInt = autoplay ? "1" : "0"
        let endSetter: String
        if let e = end {
            endSetter = "player.loadVideoById({ videoId: '\(videoId)', startSeconds: \(Int(start)), endSeconds: \(Int(e)) });"
        } else {
            endSetter = "player.loadVideoById({ videoId: '\(videoId)', startSeconds: \(Int(start)) });"
        }

        var html = ""
        html += "<!doctype html><html><head>"
        html += "<meta name=viewport content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no\">"
        html += "<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}#player{width:100vw;height:100vh;}.shield{position:absolute;inset:0;background:transparent;pointer-events:auto;}</style>"
        html += "</head><body><div id=\"player\"></div><div class=\"shield\"></div><script>"
        html += "let player=null;let ticker=null;"
        html += "const startSec=\(startSec);"
        html += "const endSec=\(endSec);"
        html += "function send(kind,data){if(!window.webkit||!window.webkit.messageHandlers||!window.webkit.messageHandlers.ytBridge)return;window.webkit.messageHandlers.ytBridge.postMessage({kind:kind,data:data});}"

        html += "function onYouTubeIframeAPIReady(){player=new YT.Player('player',{"
        html += "videoId:'\(videoId)',"
        html += "playerVars:{autoplay:\(autoplayInt),controls:0,modestbranding:1,rel:0,playsinline:1,disablekb:1,fs:0,iv_load_policy:3,"
        html += "start:\(startSec),"
        html += endPlayerVar
        html += "origin:'https://www.youtube.com'},"
        html += "events:{"
        html += "onReady:function(){send('ready',{});ticker=setInterval(function(){if(player&&player.getCurrentTime){var t=player.getCurrentTime();send('time',t);if(endSec&&t>=endSec){player.pauseVideo();}}},220);},"
        html += "onStateChange:function(e){send('state',e.data);if(e.data===YT.PlayerState.ENDED)send('ended',{});}"
        html += "}});}"

        html += "function cmd(c){if(!player)return;"
        html += "if(c.type==='play')player.playVideo();"
        html += "else if(c.type==='pause')player.pauseVideo();"
        html += "else if(c.type==='seek')player.seekTo(c.t,true);"
        html += "else if(c.type==='loop'){player.seekTo(c.a,true);player.playVideo();}"
        html += "else if(c.type==='reload'){\(endSetter)}}"
        html += "window.__cmd=cmd;"

        html += "var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);"
        html += "</script></body></html>"
        return html
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
            case .play:           js = "window.__cmd({ type: 'play' });"
            case .pause:          js = "window.__cmd({ type: 'pause' });"
            case .seek(let t):    js = "window.__cmd({ type: 'seek', t: \(t) });"
            case .loop(let a, _): js = "window.__cmd({ type: 'loop', a: \(a) });"
            case .reload:         js = "window.__cmd({ type: 'reload' });"
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
            default:
                break
            }
        }
    }
}
