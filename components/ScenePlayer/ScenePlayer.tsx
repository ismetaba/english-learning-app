import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { Scene } from '@/data/scenes';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius, Shadows } from '@/constants/Colors';

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

function getVisibleWordCount(line: Scene['lines'][0], currentTime: number): number {
  if (line.lineStartTime == null || line.lineEndTime == null) return 0;
  const words = line.text.split(' ');
  const totalWords = words.length;
  const duration = line.lineEndTime - line.lineStartTime;
  const elapsed = currentTime - line.lineStartTime;
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  return Math.ceil(progress * totalWords);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 40), animated: true });
      }
    }
  }, [activeLineIndex]);

  const duration = scene.endTime - scene.startTime;
  const elapsed = Math.max(0, Math.min(currentTime - scene.startTime, duration));
  const progressPercent = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Video */}
      <PlayerComponent
        scene={scene}
        onStateChange={handleStateChange}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Info bar with title, genre, and progress */}
      <View style={styles.infoBar}>
        <View style={styles.infoLeft}>
          <Text style={styles.movieTitle}>{scene.movieTitle}</Text>
          <View style={styles.metaRow}>
            <View style={styles.difficultyBadge}>
              <Text style={styles.difficultyText}>{scene.difficulty}</Text>
            </View>
            <Text style={styles.genreText}>{scene.genre}</Text>
            <Text style={styles.timeText}>{formatTime(elapsed)} / {formatTime(duration)}</Text>
          </View>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Transcript with word-by-word sync */}
      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>{t('dialogue')}</Text>
          <View style={styles.vocabChips}>
            {scene.vocabCoverage.map((word, index) => (
              <View key={index} style={styles.vocabChip}>
                <Text style={styles.vocabChipText}>{word}</Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView ref={scrollViewRef} style={styles.transcriptScroll} showsVerticalScrollIndicator={false}>
          {scene.lines.map((line, lineIdx) => {
            const isActive = lineIdx === activeLineIndex;
            const isPast = line.lineEndTime != null && currentTime >= line.lineEndTime;
            const words = line.text.split(' ');
            const visibleCount = isActive ? getVisibleWordCount(line, currentTime) : 0;

            return (
              <View
                key={lineIdx}
                style={[
                  styles.lineRow,
                  isActive && styles.lineRowActive,
                ]}
                onLayout={(e) => {
                  linePositionsRef.current[lineIdx] = e.nativeEvent.layout.y;
                }}
              >
                {/* Timeline dot */}
                <View style={styles.timelineCol}>
                  <View style={[
                    styles.timelineDot,
                    isActive && styles.timelineDotActive,
                    isPast && styles.timelineDotPast,
                  ]} />
                  {lineIdx < scene.lines.length - 1 && (
                    <View style={[
                      styles.timelineLine,
                      isPast && styles.timelineLinePast,
                    ]} />
                  )}
                </View>

                {/* Content */}
                <View style={styles.lineContent}>
                  <View style={styles.lineMeta}>
                    <Text style={[
                      styles.speakerName,
                      isActive && styles.speakerNameActive,
                    ]}>{line.speaker}</Text>
                    {line.lineStartTime != null && (
                      <Text style={styles.lineTimestamp}>{formatTime(line.lineStartTime)}</Text>
                    )}
                  </View>
                  <Text style={[
                    styles.lineText,
                    isActive && styles.lineTextActive,
                    isPast && styles.lineTextPast,
                  ]}>
                    {isActive ? (
                      words.map((word, idx) => {
                        const cleanWord = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
                        const isVocab = vocabWords.some(v => cleanWord === v || cleanWord === v + 's' || cleanWord === v + 'ing' || cleanWord === v + 'ed');
                        const isRevealed = idx < visibleCount;
                        return (
                          <Text
                            key={idx}
                            style={[
                              isRevealed ? styles.wordRevealed : styles.wordPending,
                              isVocab && isRevealed && styles.wordVocab,
                            ]}
                          >
                            {word}{' '}
                          </Text>
                        );
                      })
                    ) : (
                      words.map((word, idx) => {
                        const cleanWord = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
                        const isVocab = vocabWords.some(v => cleanWord === v || cleanWord === v + 's' || cleanWord === v + 'ing' || cleanWord === v + 'ed');
                        return (
                          <Text key={idx} style={isVocab ? styles.wordVocab : undefined}>
                            {word}{' '}
                          </Text>
                        );
                      })
                    )}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={styles.scrollPadding} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.bgCard,
  },
  infoLeft: {
    flex: 1,
  },
  movieTitle: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  difficultyBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  difficultyText: {
    color: palette.primaryLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  genreText: {
    color: palette.textMuted,
    fontSize: 12,
  },
  timeText: {
    color: palette.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // Progress bar
  progressBarTrack: {
    height: 3,
    backgroundColor: palette.bgSurface,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: palette.primary,
  },

  // Transcript
  transcriptContainer: {
    flex: 1,
    backgroundColor: palette.bgElevated,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  transcriptLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  transcriptScroll: {
    flex: 1,
    paddingTop: 8,
  },

  // Line rows
  lineRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lineRowActive: {
    backgroundColor: palette.primarySoft,
  },

  // Timeline column
  timelineCol: {
    width: 20,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.bgSurface,
    marginTop: 6,
  },
  timelineDotActive: {
    backgroundColor: palette.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineDotPast: {
    backgroundColor: palette.accent,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: palette.border,
    marginTop: 4,
  },
  timelineLinePast: {
    backgroundColor: palette.accentSoft,
  },

  // Line content
  lineContent: {
    flex: 1,
  },
  lineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  speakerName: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  speakerNameActive: {
    color: palette.primary,
  },
  lineTimestamp: {
    color: palette.textDisabled,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  lineText: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  lineTextActive: {
    color: palette.textPrimary,
    fontSize: 16,
    lineHeight: 26,
  },
  lineTextPast: {
    color: palette.textMuted,
  },

  // Word-by-word styles
  wordRevealed: {
    color: palette.textPrimary,
  },
  wordPending: {
    color: palette.textDisabled,
  },
  wordVocab: {
    color: palette.xp,
    fontWeight: '700',
  },

  // Vocab chips
  vocabChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  vocabChip: {
    backgroundColor: palette.bgSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: palette.border,
  },
  vocabChipText: {
    color: palette.xp,
    fontSize: 11,
    fontWeight: '600',
  },

  scrollPadding: {
    height: 40,
  },
});
