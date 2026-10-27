// Deterministic stand-in for https://www.youtube.com/iframe_api.
//
// Models the subset of the IFrame Player API the app relies on, with the
// real API's documented behaviour:
//   - playerVars.start / playerVars.end are whole seconds (floored)
//   - loadVideoById / cueVideoById take fractional startSeconds/endSeconds
//   - reaching endSeconds (or playerVars.end) moves the player to ENDED (0)
//   - loadVideoById / cueVideoById reset the playback rate to 1
//   - an unplayable video fires onError(150) followed by UNSTARTED (-1)
//   - getCurrentTime() advances with wall clock × playback rate while PLAYING
//
// Knobs (set window.__fakeYT before this script runs):
//   readyDelayMs  delay before onReady              (default 250)
//   bufferMs      BUFFERING time before PLAYING     (default 150)
//   duration      media duration in seconds         (default 600)
//   blocked       video ids that error with 150     (default: ids containing "BLOCKED")
(function () {
  const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  const cfg = Object.assign({ readyDelayMs: 250, bufferMs: 150, duration: 600, blocked: [] }, window.__fakeYT || {});
  const nowSec = () => performance.now() / 1000;

  class Player {
    constructor(elementId, opts) {
      this._opts = opts || {};
      this._events = this._opts.events || {};
      this._vars = this._opts.playerVars || {};
      this._rate = 1;
      this._muted = false;
      this._state = S.UNSTARTED;
      this._t = 0;
      this._anchorHost = null;
      this._end = null;
      this._videoId = null;
      this._bufferTimer = null;
      this._ready = false;
      this._destroyed = false;
      (window.__fakePlayers = window.__fakePlayers || []).push(this);
      this._clock = setInterval(() => this._tick(), 5);
      setTimeout(() => {
        if (this._destroyed) return;
        this._ready = true;
        this._fire('onReady', { target: this });
        if (this._opts.videoId) {
          const start = Math.floor(this._vars.start || 0);
          const end = this._vars.end != null ? Math.floor(this._vars.end) : null;
          if (this._vars.autoplay === 1) this._load(this._opts.videoId, start, end, true);
          else this._load(this._opts.videoId, start, end, false);
        }
      }, cfg.readyDelayMs);
    }

    // --- internal -----------------------------------------------------
    _fire(name, payload) {
      const fn = this._events[name];
      if (typeof fn === 'function') fn(payload);
    }
    _setState(s) {
      if (this._state === s) return;
      this._state = s;
      this._fire('onStateChange', { target: this, data: s });
    }
    _isBlocked(id) {
      return String(id).includes('BLOCKED') || cfg.blocked.includes(id);
    }
    _freeze() {
      if (this._anchorHost != null) {
        this._t = this._t + (nowSec() - this._anchorHost) * this._rate;
        this._anchorHost = null;
      }
    }
    _startPlaying() {
      clearTimeout(this._bufferTimer);
      this._freeze();
      this._setState(S.BUFFERING);
      this._bufferTimer = setTimeout(() => {
        if (this._destroyed || this._state !== S.BUFFERING) return;
        this._anchorHost = nowSec();
        this._setState(S.PLAYING);
      }, cfg.bufferMs);
    }
    _load(videoId, start, end, autoplay) {
      clearTimeout(this._bufferTimer);
      this._anchorHost = null;
      this._videoId = videoId;
      this._t = start || 0;
      this._end = end == null ? null : end;
      this._rate = 1; // real API resets rate on (re)load
      this._setState(S.UNSTARTED);
      if (this._isBlocked(videoId)) {
        setTimeout(() => {
          this._fire('onError', { target: this, data: 150 });
          this._setState(S.UNSTARTED);
        }, 60);
        return;
      }
      if (autoplay) this._startPlaying();
      else this._setState(S.CUED);
    }
    _tick() {
      if (this._state !== S.PLAYING) return;
      const t = this.getCurrentTime();
      const limit = this._end != null ? this._end : cfg.duration;
      if (t >= limit) {
        this._t = limit;
        this._anchorHost = null;
        this._setState(S.ENDED);
      }
    }

    // --- public API -----------------------------------------------------
    loadVideoById(arg, startSeconds) {
      if (typeof arg === 'object') this._load(arg.videoId, arg.startSeconds || 0, arg.endSeconds, true);
      else this._load(arg, startSeconds || 0, null, true);
    }
    cueVideoById(arg, startSeconds) {
      if (typeof arg === 'object') this._load(arg.videoId, arg.startSeconds || 0, arg.endSeconds, false);
      else this._load(arg, startSeconds || 0, null, false);
    }
    playVideo() {
      if (!this._videoId || this._isBlocked(this._videoId)) return;
      if (this._state === S.PLAYING || this._state === S.BUFFERING) return;
      if (this._state === S.ENDED) {
        // Replaying an ended, end-bounded video restarts at its start.
        this._t = Math.floor(this._vars.start || 0);
      }
      this._startPlaying();
    }
    pauseVideo() {
      if (this._state === S.PLAYING || this._state === S.BUFFERING) {
        clearTimeout(this._bufferTimer);
        this._freeze();
        this._setState(S.PAUSED);
      }
    }
    seekTo(seconds, _allowSeekAhead) {
      const wasPlaying = this._state === S.PLAYING || this._state === S.BUFFERING;
      this._freeze();
      this._t = Math.max(0, seconds);
      if (this._state === S.ENDED || wasPlaying) this._startPlaying();
    }
    getCurrentTime() {
      if (this._anchorHost == null) return this._t;
      return this._t + (nowSec() - this._anchorHost) * this._rate;
    }
    getPlayerState() { return this._state; }
    getDuration() { return cfg.duration; }
    getVideoData() { return { video_id: this._videoId }; }
    setPlaybackRate(r) {
      const allowed = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      if (!allowed.includes(r)) return;
      this._freeze();
      this._rate = r;
      if (this._state === S.PLAYING) this._anchorHost = nowSec();
    }
    getPlaybackRate() { return this._rate; }
    mute() { this._muted = true; }
    unMute() { this._muted = false; }
    isMuted() { return this._muted; }
    destroy() {
      this._destroyed = true;
      clearInterval(this._clock);
      clearTimeout(this._bufferTimer);
    }
  }

  window.YT = { Player, PlayerState: S };
  setTimeout(() => {
    if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
  }, 0);
})();
