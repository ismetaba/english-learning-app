import Foundation

/// Builds the HTML page that hosts the YouTube IFrame API inside the
/// player's WKWebView. Foundation-only so the exact page the app loads
/// can be exercised outside iOS (see `Tools/PlayerHarness`).
public enum YouTubeEmbedHTML {
    public static func make(videoId: String, start: Double, end: Double?, autoplay: Bool) -> String {
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
        html += "host:'https://www.youtube-nocookie.com',"
        html += "videoId:'\(videoId)',"
        html += "playerVars:{autoplay:\(autoplayInt),controls:0,modestbranding:1,rel:0,playsinline:1,disablekb:1,fs:0,iv_load_policy:3,"
        html += "start:\(startSec),"
        html += endPlayerVar
        html += "origin:'https://www.youtube-nocookie.com'},"
        html += "events:{"
        html += "onReady:function(){send('ready',{});ticker=setInterval(function(){if(player&&player.getCurrentTime){var t=player.getCurrentTime();send('time',t);if(endSec&&t>=endSec){player.pauseVideo();}}},220);},"
        html += "onStateChange:function(e){send('state',e.data);if(e.data===YT.PlayerState.ENDED)send('ended',{});},"
        html += "onError:function(e){send('error',e.data);}"
        html += "}});}"

        html += "function cmd(c){if(!player)return;"
        html += "if(c.type==='play')player.playVideo();"
        html += "else if(c.type==='pause')player.pauseVideo();"
        html += "else if(c.type==='seek')player.seekTo(c.t,true);"
        html += "else if(c.type==='loop'){player.seekTo(c.a,true);player.playVideo();}"
        html += "else if(c.type==='reload'){\(endSetter)}"
        html += "else if(c.type==='setSpeed'&&player.setPlaybackRate)player.setPlaybackRate(c.r);"
        html += "else if(c.type==='setMuted'){if(c.m){player.mute&&player.mute();}else{player.unMute&&player.unMute();}}}"
        html += "window.__cmd=cmd;"

        html += "var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);"
        html += "</script></body></html>"
        return html
    }
}
