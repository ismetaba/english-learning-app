import Foundation

/// Builds the HTML page that hosts the YouTube IFrame API inside the
/// player's WKWebView. Foundation-only so the exact page the app loads
/// can be exercised outside iOS (see `Tools/PlayerHarness`).
///
/// One page serves a player's whole lifetime: later clips arrive as `load`
/// commands (see `PlayerCommand`), not as new pages.
public enum YouTubeEmbedHTML {
    /// WKScriptMessageHandler the page posts its events to.
    static let messageHandlerName = "ytBridge"
    /// The page's origin (WKWebView baseURL), the player's host and its
    /// `origin` playerVar. They must agree, or YouTube refuses to play many
    /// clips (error 152); the IFrame API script itself is only served from
    /// www.youtube.com.
    static let origin = "https://www.youtube-nocookie.com"

    /// Pre-v2 entry point.
    public static func make(videoId: String, start: Double, end: Double?, autoplay: Bool) -> String {
        make(source: PlayerSource(videoId: videoId, start: start, end: end, autoplay: autoplay))
    }

    /// Primitive-typed entry for tools outside the module (Tools/EmbedHTML),
    /// which can't see the internal `PlayerSource`.
    public static func make(
        videoId: String, start: Double, end: Double?, autoplay: Bool, loop: Bool, rate: Double, muted: Bool
    ) -> String {
        make(source: PlayerSource(videoId: videoId, start: start, end: end, autoplay: autoplay, loop: loop),
             rate: rate, muted: muted)
    }
}

extension YouTubeEmbedHTML {
    /// Page that starts by loading `source` (exact fractional bounds) at
    /// `rate`, optionally muted.
    static func make(source: PlayerSource, rate: Double = 1, muted: Bool = false) -> String {
        let config = JSLiteral.object([
            ("load", PlayerCommand.load(source).payload),
            ("rate", .number(rate)),
            ("muted", .bool(muted)),
        ]).source
        return page(config: config)
    }

    // The script keeps all player logic in the page so it runs next to the
    // player, not across the async WebKit bridge:
    //  - commands before the YouTube player is ready are queued, not dropped;
    //  - the clip window [start, end) is enforced here: at end - END_EPS it
    //    loops (seekTo start) or pauses and posts `clipEnd` exactly once;
    //  - rate and mute are page state, re-applied on every PLAYING because
    //    the API resets the rate to 1 on each load;
    //  - the playhead is posted ~every 100ms while playing/buffering, right
    //    after every seek, load and state change (so the karaoke jumps with
    //    a seek instead of waiting out the buffering), and never after an
    //    error until the next load.
    private static func page(config: String) -> String {
        #"""
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
        <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}#player{width:100vw;height:100vh;}.shield{position:absolute;inset:0;background:transparent;pointer-events:auto;}</style>
        </head><body><div id="player"></div><div class="shield"></div><script>
        (function () {
          'use strict';
          var CONFIG = \#(config);
          var LOAD_FAILED = \#(YouTubeError.loadTimeoutCode);
          var S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
          var TICK_MS = 50;           // end-of-window checks while playing/buffering
          var TIME_GAP_MS = 75;       // playhead posts every other tick (~100ms)
          var END_EPS = 0.03;         // stop/wrap this close to `end`, before the API ends the video
          var SEEK_SLOP = 0.5;        // readings this close to a seek target are post-seek
          var SEEK_SETTLE_MS = 1500;  // after this, trust readings again whatever they say
          var MIN_LOOP = 0.2;         // shorter loop windows would seek non-stop; play them once

          var player = null, ready = false, destroyed = false;
          var queue = CONFIG.load ? [CONFIG.load] : [];
          var videoId = null, apiEnd = null;
          var win = { start: 0, end: null, loop: false };
          var rate = num(CONFIG.rate, 1), muted = CONFIG.muted === true;
          var state = S.UNSTARTED;
          var wantPlaying = false, clipEnded = false, errored = false;
          var pending = null;
          var ticker = null, endTimer = null, lastTime = null, lastTimeAt = -Infinity;

          function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
          function nowMs() { return performance.now(); }

          function send(kind, fields) {
            if (destroyed) return;
            var msg = fields || {};
            msg.kind = kind;
            try { window.webkit.messageHandlers.\#(messageHandlerName).postMessage(msg); } catch (e) {}
          }

          // --- playhead ----------------------------------------------------

          function rawTime() {
            try { return num(player.getCurrentTime(), null); } catch (e) { return null; }
          }

          // The API answers getCurrentTime() from the iframe's last report, so
          // right after seekTo/load it can still return the old position. Such
          // a reading would flick the karaoke back and re-trigger the window
          // end (a second wrap, a spurious clipEnd), so it is ignored until
          // the player catches up with the target.
          function freshTime() {
            var t = rawTime();
            if (t === null || !pending) return t;
            var age = nowMs() - pending.at;
            var high = pending.t + SEEK_SLOP + (age / 1000) * Math.max(rate, 1);
            if (age < SEEK_SETTLE_MS && (t < pending.t - SEEK_SLOP || t > high)) return null;
            pending = null;
            return t;
          }

          function knownTime() {
            var t = freshTime();
            return t !== null ? t : pending ? pending.t : null;
          }

          function markSeek(t) { pending = { t: t, at: nowMs() }; }

          function postTime(t, playing) {
            if (errored || t === null) return;
            var p = playing === undefined ? state === S.PLAYING : playing;
            var now = nowMs();
            // One change is often reported twice in a burst (seek, then the
            // BUFFERING it causes; clipEnd, then PAUSED).
            if (lastTime && Math.abs(lastTime.t - t) < 0.002 && lastTime.playing === p && now - lastTimeAt < 30) return;
            lastTime = { t: t, playing: p };
            lastTimeAt = now;
            send('time', { t: t, playing: p });
          }

          // --- clip window -------------------------------------------------

          function startTicker() { if (!ticker) ticker = setInterval(tick, TICK_MS); }

          function stopTicker() {
            if (ticker) { clearInterval(ticker); ticker = null; }
            clearEndTimer();
          }

          function clearEndTimer() {
            if (endTimer) { clearTimeout(endTimer); endTimer = null; }
          }

          function tick() {
            if (!player || errored) return;
            var t = freshTime();
            if (t === null || atEnd(t)) return;
            if (nowMs() - lastTimeAt >= TIME_GAP_MS) postTime(t);
            aimEndTimer(t);
          }

          // Interval ticks alone overshoot `end` by up to TICK_MS × rate; a
          // one-shot timer aimed at the exact moment keeps stops and loop
          // wraps ahead of the API's own endSeconds, which would end the
          // video and can flash YouTube's end screen.
          function aimEndTimer(t) {
            if (endTimer || win.end === null || state !== S.PLAYING) return;
            var r = rate;
            try { r = num(player.getPlaybackRate(), rate); } catch (e) {}
            var ms = (win.end - END_EPS - t) / Math.max(r, 0.1) * 1000;
            if (ms >= TICK_MS) return;
            endTimer = setTimeout(function () {
              endTimer = null;
              var now = freshTime();
              if (now !== null) atEnd(now);
            }, Math.max(0, ms));
          }

          // Handles the playhead being at the window's end; true if it was.
          function atEnd(t) {
            if (win.end === null || t < win.end - END_EPS) return false;
            finishWindow(t);
            return true;
          }

          function finishWindow(t) {
            clearEndTimer();
            if (win.loop && (win.end === null || win.end - win.start >= MIN_LOOP)) {
              if (wantPlaying) wrap();
              return;
            }
            wantPlaying = false;
            if (state === S.PLAYING || state === S.BUFFERING) player.pauseVideo();
            if (clipEnded) return;
            clipEnded = true;
            postTime(t, false);
            send('clipEnd', { t: t });
          }

          function wrap() {
            markSeek(win.start);
            player.seekTo(win.start, true);
            postTime(win.start);
          }

          function bounds(c) {
            return { start: Math.max(0, num(c.start, 0)), end: num(c.end, null), loop: c.loop === true };
          }

          // --- rate & mute -------------------------------------------------

          function applyRate() {
            try { if (player.getPlaybackRate() !== rate) player.setPlaybackRate(rate); } catch (e) {}
          }

          function applyMute() {
            try {
              if (player.isMuted() !== muted) { if (muted) player.mute(); else player.unMute(); }
            } catch (e) {}
          }

          // --- commands ----------------------------------------------------

          var commands = {
            load: function (c) {
              if (typeof c.videoId !== 'string' || c.videoId === '') return;
              videoId = c.videoId;
              win = bounds(c);
              apiEnd = win.end;
              errored = false;
              clipEnded = false;
              lastTime = null;
              wantPlaying = c.autoplay !== false;
              clearEndTimer();
              markSeek(win.start);
              var args = { videoId: videoId, startSeconds: win.start };
              if (win.end !== null) args.endSeconds = win.end;
              if (wantPlaying) player.loadVideoById(args); else player.cueVideoById(args);
              applyRate();
              applyMute();
              postTime(win.start, false);
            },
            play: function () {
              wantPlaying = true;
              if (clipEnded || state === S.ENDED) {
                // A finished window replays from its start.
                clipEnded = false;
                markSeek(win.start);
                player.seekTo(win.start, true);
              }
              player.playVideo();
            },
            pause: function () {
              wantPlaying = false;
              player.pauseVideo();
            },
            seek: function (c) {
              var t = num(c.t, null);
              if (t === null) return;
              t = Math.max(0, t);
              if (win.end === null || t < win.end - END_EPS) clipEnded = false;
              clearEndTimer();
              markSeek(t);
              player.seekTo(t, true);
              postTime(t);
            },
            setBounds: function (c) {
              var t = knownTime();
              win = bounds(c);
              if (t === null || win.end === null || t < win.end - END_EPS) clipEnded = false;
              clearEndTimer();
              // The endSeconds handed to the API can only be lifted by
              // reloading; do that in place if the window grows past it.
              if (videoId !== null && !errored && apiEnd !== null && (win.end === null || win.end > apiEnd)) {
                var at = t !== null ? t : win.start;
                var args = { videoId: videoId, startSeconds: at };
                if (win.end !== null) args.endSeconds = win.end;
                apiEnd = win.end;
                markSeek(at);
                if (wantPlaying) player.loadVideoById(args); else player.cueVideoById(args);
                applyRate();
                applyMute();
              }
            }
          };

          function run(cmd) {
            try { commands[cmd.type](cmd); } catch (e) {
              if (window.console) console.error('player: ' + cmd.type + ' failed', e);
            }
          }

          function exec(cmd) {
            if (destroyed || !cmd || typeof cmd.type !== 'string') return;
            if (cmd.type === 'setRate') {
              var r = num(cmd.rate, null);
              if (r !== null && r > 0) { rate = r; if (ready) applyRate(); }
              return;
            }
            if (cmd.type === 'setMuted') {
              muted = cmd.muted === true;
              if (ready) applyMute();
              return;
            }
            if (!Object.prototype.hasOwnProperty.call(commands, cmd.type)) return;
            if (!ready) {
              // A newer source supersedes everything queued for the old one.
              if (cmd.type === 'load') queue = [];
              queue.push(cmd);
              return;
            }
            run(cmd);
          }

          function destroy() {
            if (destroyed) return;
            destroyed = true;
            stopTicker();
            queue = [];
            try { if (player) player.destroy(); } catch (e) {}
            player = null;
          }

          // --- YouTube events ----------------------------------------------

          function onReady() {
            if (destroyed) return;
            ready = true;
            send('ready');
            applyMute();
            var queued = queue;
            queue = [];
            for (var i = 0; i < queued.length; i++) run(queued[i]);
          }

          function onStateChange(e) {
            if (destroyed || !e || typeof e.data !== 'number') return;
            var s = e.data;
            state = s;
            send('state', { s: s });
            if (s === S.PLAYING) {
              applyRate();
              applyMute();
              // Playback the app didn't ask for (e.g. a load that was paused
              // before it started, or seekTo from CUED, which plays).
              if (!wantPlaying) { player.pauseVideo(); return; }
            }
            if (s === S.PLAYING || s === S.BUFFERING) startTicker(); else stopTicker();
            if (s === S.ENDED) {
              var t = knownTime();
              finishWindow(t !== null ? t : win.end !== null ? win.end : 0);
              return;
            }
            postTime(knownTime());
          }

          function onError(e) {
            if (destroyed) return;
            errored = true;
            wantPlaying = false;
            pending = null;
            lastTime = null;
            stopTicker();
            send('error', { code: num(e && e.data, LOAD_FAILED) });
          }

          window.onYouTubeIframeAPIReady = function () {
            if (destroyed || player) return;
            try {
              player = new YT.Player('player', {
                host:'\#(origin)',
                playerVars:{playsinline:1,controls:0,disablekb:1,fs:0,rel:0,iv_load_policy:3,modestbranding:1,mute:muted?1:0,origin:'\#(origin)'},
                events:{onReady:onReady,onStateChange:onStateChange,onError:onError}
              });
            } catch (e) {
              onError({ data: LOAD_FAILED });
            }
          };

          var api = document.createElement('script');
          api.src = 'https://www.youtube.com/iframe_api';
          api.onerror = function () { if (!ready) onError({ data: LOAD_FAILED }); };
          document.head.appendChild(api);

          window.__player = { exec: exec, destroy: destroy };
          send('bridge');
        })();
        </script></body></html>
        """#
    }
}
