import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { Scene } from '@/data/scenes';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius } from '@/constants/Colors';

interface ScenePlayerProps {
  scene: Scene;
  onComplete?: () => void;
}

function YouTubePlayerWeb({ scene, onStateChange, onTimeUpdate }: {
  scene: Scene;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
}) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const initPlayer = () => {
      playerRef.current = new (window as any).YT.Player('yt-player', {
        videoId: scene.youtubeVideoId,
        playerVars: {
          start: scene.startTime,
          end: scene.endTime,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          cc_load_policy: 1,
          cc_lang_pref: 'en',
        },
        events: {
          onStateChange: (e: any) => {
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              onStateChange('playing');
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const currentTime = playerRef.current?.getCurrentTime?.();
                if (currentTime != null && onTimeUpdate) {
                  onTimeUpdate(currentTime);
                }
              }, 250);
            } else if (e.data === YT.PlayerState.PAUSED) {
              onStateChange('paused');
              clearInterval(intervalRef.current);
            } else if (e.data === YT.PlayerState.ENDED) {
              onStateChange('ended');
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      clearInterval(intervalRef.current);
      playerRef.current?.destroy?.();
    };
  }, [scene.youtubeVideoId]);

  return (
    <View style={styles.videoContainer}>
      <div id="yt-player" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

function YouTubePlayerNative({ scene, onStateChange, onTimeUpdate }: {
  scene: Scene;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
}) {
  const WebView = require('react-native-webview').default;
  const webViewRef = useRef<any>(null);

  const youtubeHtml = `
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
            videoId: '${scene.youtubeVideoId}',
            playerVars: {
              start: ${scene.startTime},
              end: ${scene.endTime},
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
              }
            }
          });
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'timeUpdate' && onTimeUpdate) {
        onTimeUpdate(data.time);
      } else if (data.type === 'playing' || data.type === 'paused' || data.type === 'ended') {
        onStateChange(data.type);
      }
    } catch {}
  }, [onStateChange, onTimeUpdate]);

  return (
    <View style={styles.videoContainer}>
      <WebView
        ref={webViewRef}
        source={{ html: youtubeHtml }}
        style={styles.video}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onMessage={handleMessage}
      />
    </View>
  );
}

function getActiveLineIndex(lines: Scene['lines'], currentTime: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.lineStartTime != null && line.lineEndTime != null) {
      if (currentTime >= line.lineStartTime && currentTime < line.lineEndTime) {
        return i;
      }
    }
  }
  return -1;
}

export default function ScenePlayer({ scene, onComplete }: ScenePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const linePositionsRef = useRef<Record<number, number>>({});

  const handleStateChange = useCallback((state: 'playing' | 'paused' | 'ended') => {
    setIsPlaying(state === 'playing');
    if (state === 'ended') {
      onComplete?.();
    }
  }, [onComplete]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const PlayerComponent = Platform.OS === 'web' ? YouTubePlayerWeb : YouTubePlayerNative;

  const vocabWords = (scene.vocabCoverage || []).map(w => w.toLowerCase());
  const activeLineIndex = getActiveLineIndex(scene.lines, currentTime);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineIndex >= 0 && scrollViewRef.current) {
      const y = linePositionsRef.current[activeLineIndex];
      if (y != null) {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
      }
    }
  }, [activeLineIndex]);

  return (
    <View style={styles.container}>
      <View style={styles.videoWrapper}>
        <PlayerComponent
          scene={scene}
          onStateChange={handleStateChange}
          onTimeUpdate={handleTimeUpdate}
        />
        {/* Subtitle overlay */}
        {activeLineIndex >= 0 && (
          <View style={styles.subtitleOverlay} pointerEvents="none">
            <Text style={styles.subtitleText}>
              {scene.lines[activeLineIndex].text}
            </Text>
          </View>
        )}
      </View>

      {/* Movie info */}
      <View style={styles.infoBar}>
        <Text style={styles.movieTitle}>{scene.movieTitle}</Text>
        <Text style={styles.genre}>{scene.genre}</Text>
      </View>

      {/* Dialogue lines with speaker labels and highlighted vocab */}
      <View style={styles.dialogueContainer}>
        <Text style={styles.dialogueLabel}>{t('dialogue')}</Text>
        <ScrollView ref={scrollViewRef} style={styles.dialogueScroll}>
          {scene.lines.map((line, lineIdx) => (
            <View
              key={lineIdx}
              style={[
                styles.dialogueLine,
                lineIdx === activeLineIndex && styles.activeDialogueLine,
              ]}
              onLayout={(e) => {
                linePositionsRef.current[lineIdx] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.speakerName}>{line.speaker}</Text>
              <Text style={styles.dialogueText}>
                {line.text.split(' ').map((word, idx) => {
                  const cleanWord = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
                  const isVocab = vocabWords.some(v => cleanWord === v || cleanWord === v + 's' || cleanWord === v + 'ing' || cleanWord === v + 'ed');
                  return (
                    <Text key={idx} style={isVocab ? styles.highlightedWord : undefined}>
                      {word}{' '}
                    </Text>
                  );
                })}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Vocab coverage */}
      <View style={styles.vocabBar}>
        <Text style={styles.vocabLabel}>{t('targetWords')}</Text>
        <View style={styles.vocabChips}>
          {scene.vocabCoverage.map((word, index) => (
            <View key={index} style={styles.vocabChip}>
              <Text style={styles.vocabChipText}>{word}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  videoWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  subtitleOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  subtitleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  activeDialogueLine: {
    backgroundColor: palette.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: -8,
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: palette.bgCard,
  },
  movieTitle: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  genre: {
    color: palette.textMuted,
    fontSize: 13,
  },
  dialogueContainer: {
    flex: 1,
    backgroundColor: palette.bgElevated,
    padding: 16,
  },
  dialogueLabel: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  dialogueScroll: {
    flex: 1,
  },
  dialogueLine: {
    marginBottom: 12,
  },
  speakerName: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  dialogueText: {
    color: palette.textSecondary,
    fontSize: 17,
    lineHeight: 28,
  },
  highlightedWord: {
    color: palette.xp,
    fontWeight: '700',
    backgroundColor: palette.xpGlow,
    borderRadius: 3,
  },
  vocabBar: {
    backgroundColor: palette.bgCard,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  vocabLabel: {
    color: palette.textMuted,
    fontSize: 12,
    marginRight: 4,
  },
  vocabChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  vocabChip: {
    backgroundColor: palette.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  vocabChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
