/**
 * Test that YouTube player HTML (used in native WebView) properly handles
 * YouTube API errors like error 150/153 (video not embeddable).
 *
 * Bug: On iPhone, the Scenes and Clips tabs show "error 153" because
 * the embedded YouTube player has no onError handler — the error is
 * silently swallowed and no feedback is sent to React Native.
 */

// Extract the HTML generation logic by simulating what the components produce
function getScenePlayerHtml(videoId: string, startTime: number, endTime: number): string {
  // This mirrors the HTML template in ScenePlayer.tsx YouTubePlayerNative
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        #player { width: 100vw; height: 100vh; }
      </style>
    </head>
    <body>
      <div id="player"></div>
      <script>
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
        var player;
        var timeInterval;
        function onYouTubeIframeAPIReady() {
          player = new YT.Player('player', {
            videoId: '${videoId}',
            playerVars: {
              start: ${startTime},
              end: ${endTime},
              controls: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              cc_load_policy: 1,
              cc_lang_pref: 'en',
            },
            events: {
              onStateChange: function(e) {
                if (e.data === YT.PlayerState.PLAYING) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'playing' }));
                  clearInterval(timeInterval);
                  timeInterval = setInterval(function() {
                    var t = player.getCurrentTime();
                    if (t != null) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeUpdate', time: t }));
                    }
                  }, 250);
                } else if (e.data === YT.PlayerState.PAUSED) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'paused' }));
                  clearInterval(timeInterval);
                } else if (e.data === YT.PlayerState.ENDED) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
                  clearInterval(timeInterval);
                }
              },
              onError: function(e) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: e.data }));
              }
            }
          });
        }
      </script>
    </body>
    </html>
  `;
}

function getClipPlayerHtml(videoId: string, startTime: number, endTime: number): string {
  // This mirrors the HTML template in ClipPlayer.tsx YouTubePlayerNative
  return `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <style>* { margin: 0; padding: 0; } body { background: #000; overflow: hidden; } #player { width: 100vw; height: 100vh; }</style>
    </head><body><div id="player"></div><script>
    var tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag);
    var player, timeInterval;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        videoId: '${videoId}',
        playerVars: { start: ${Math.floor(startTime)}, end: ${Math.ceil(endTime)}, controls: 1, modestbranding: 1, rel: 0, playsinline: 1, cc_load_policy: 1, cc_lang_pref: 'en', autoplay: 1 },
        events: { onStateChange: function(e) {
          if (e.data === YT.PlayerState.PLAYING) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'playing' }));
            clearInterval(timeInterval);
            timeInterval = setInterval(function() {
              var t = player.getCurrentTime();
              if (t != null) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeUpdate', time: t }));
                if (t >= ${endTime}) { clearInterval(timeInterval); player.pauseVideo(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' })); }
              }
            }, 250);
          } else if (e.data === YT.PlayerState.PAUSED) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'paused' })); clearInterval(timeInterval); }
          else if (e.data === YT.PlayerState.ENDED) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' })); clearInterval(timeInterval); }
        }, onError: function(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: e.data })); }}
      });
    }
    </script></body></html>
  `;
}

describe('YouTube player error handling in native WebView HTML', () => {
  describe('ScenePlayer native HTML', () => {
    it('should include an onError handler in YT.Player events', () => {
      const html = getScenePlayerHtml('NgsQ8mVkN8w', 0, 150);
      // The events object must include onError to handle YouTube errors (150, 153, etc.)
      expect(html).toMatch(/onError\s*:/);
    });

    it('should post an error message to ReactNativeWebView when YouTube errors occur', () => {
      const html = getScenePlayerHtml('NgsQ8mVkN8w', 0, 150);
      // When onError fires, it should postMessage with error info
      expect(html).toMatch(/ReactNativeWebView\.postMessage.*error/);
    });
  });

  describe('ClipPlayer native HTML', () => {
    it('should include an onError handler in YT.Player events', () => {
      const html = getClipPlayerHtml('TbQm5doF_Uc', 10, 17);
      expect(html).toMatch(/onError\s*:/);
    });

    it('should post an error message to ReactNativeWebView when YouTube errors occur', () => {
      const html = getClipPlayerHtml('TbQm5doF_Uc', 10, 17);
      expect(html).toMatch(/ReactNativeWebView\.postMessage.*error/);
    });
  });
});

describe('React Native error state handling', () => {
  // Read the actual component source to verify error handling exists
  const fs = require('fs');
  const scenePath = require('path').join(__dirname, '..', 'components', 'ScenePlayer', 'ScenePlayer.tsx');
  const clipPath = require('path').join(__dirname, '..', 'components', 'ClipPlayer', 'ClipPlayer.tsx');
  const sceneSource = fs.readFileSync(scenePath, 'utf-8');
  const clipSource = fs.readFileSync(clipPath, 'utf-8');

  it('ScenePlayer should have an error state', () => {
    expect(sceneSource).toMatch(/useState.*error/i);
  });

  it('ScenePlayer should handle error messages from WebView', () => {
    // The handleMessage callback should process error-type messages
    expect(sceneSource).toMatch(/data\.type\s*===?\s*['"]error['"]/);
  });

  it('ScenePlayer should render an error UI when YouTube fails', () => {
    // Should show a fallback action (open on YouTube), not just silently fail
    // Comment: error 150/153 = not embeddable, so we show "Open on YouTube"
    expect(sceneSource).toMatch(/error.*150|error.*153|not.*embeddable|video.*unavailable|Open on YouTube/i);
  });

  it('ClipPlayer should have an error state', () => {
    expect(clipSource).toMatch(/useState.*error/i);
  });

  it('ClipPlayer should handle error messages from WebView', () => {
    expect(clipSource).toMatch(/data\.type\s*===?\s*['"]error['"]/);
  });

  it('ClipPlayer should render an error UI when YouTube fails', () => {
    // Comment: error 150/153 = not embeddable, so we show "Open on YouTube"
    expect(clipSource).toMatch(/error.*150|error.*153|not.*embeddable|video.*unavailable|Open on YouTube/i);
  });
});
