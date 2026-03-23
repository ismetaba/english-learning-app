import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface YouTubeWebViewRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

interface Props {
  videoId: string;
  width: number;
  height: number;
  onReady?: () => void;
  onTimeUpdate?: (time: number) => void;
  onStateChange?: (state: 'playing' | 'paused' | 'buffering' | 'ended') => void;
  play?: boolean;
  initialPlayerParams?: {
    controls?: boolean;
    modestbranding?: boolean;
    rel?: boolean;
    start?: number;
  };
}

const YouTubeWebView = forwardRef<YouTubeWebViewRef, Props>(({
  videoId,
  width,
  height,
  onReady,
  onTimeUpdate,
  onStateChange,
  play = true,
  initialPlayerParams = {},
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const isReady = useRef(false);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      webViewRef.current?.injectJavaScript(`
        if (window.player) { window.player.seekTo(${seconds}, true); }
        true;
      `);
    },
    play: () => {
      webViewRef.current?.injectJavaScript(`
        if (window.player) { window.player.playVideo(); }
        true;
      `);
    },
    pause: () => {
      webViewRef.current?.injectJavaScript(`
        if (window.player) { window.player.pauseVideo(); }
        true;
      `);
    },
  }));

  // React to play prop changes
  useEffect(() => {
    if (!isReady.current) return;
    if (play) {
      webViewRef.current?.injectJavaScript(`
        if (window.player) { window.player.playVideo(); }
        true;
      `);
    } else {
      webViewRef.current?.injectJavaScript(`
        if (window.player) { window.player.pauseVideo(); }
        true;
      `);
    }
  }, [play]);

  const onMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'time') {
        onTimeUpdate?.(data.value);
      } else if (data.type === 'state') {
        onStateChange?.(data.value);
      } else if (data.type === 'ready') {
        isReady.current = true;
        onReady?.();
      }
    } catch {}
  }, [onTimeUpdate, onStateChange, onReady]);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; overflow: hidden; }
    #player { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    var player;
    var lastPostedTime = -1;

    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        videoId: '${videoId}',
        playerVars: {
          controls: ${initialPlayerParams.controls === false ? 0 : 1},
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          iv_load_policy: 3,
          autoplay: ${play ? 1 : 0},
          ${initialPlayerParams.start ? `start: ${initialPlayerParams.start},` : ''}
        },
        events: {
          onReady: function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
            startTimeLoop();
          },
          onStateChange: function(e) {
            var states = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering' };
            var state = states[e.data] || 'unknown';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'state', value: state }));
          }
        }
      });
    }

    function startTimeLoop() {
      function tick() {
        if (player && player.getCurrentTime) {
          var t = player.getCurrentTime();
          if (Math.abs(t - lastPostedTime) > 0.005) {
            lastPostedTime = t;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'time', value: t }));
          }
        }
        requestAnimationFrame(tick);
      }
      tick();
    }
  </script>
</body>
</html>`;

  if (Platform.OS === 'web') return null;

  return (
    <WebView
      ref={webViewRef}
      source={{ html, baseUrl: 'https://www.youtube.com' }}
      style={{ width, height, backgroundColor: '#000' }}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback={true}
      javaScriptEnabled={true}
      onMessage={onMessage}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      originWhitelist={['*']}
      allowsFullscreenVideo={true}
    />
  );
});

YouTubeWebView.displayName = 'YouTubeWebView';
export default YouTubeWebView;
