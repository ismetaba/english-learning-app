import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Linking, Dimensions } from 'react-native';

const { width: screenW } = Dimensions.get('window');
import { Scene } from '@/data/scenes';
import { getWordTimestamps } from '@/data/scenes/word-timing';
import { useTranslation } from '@/hooks/useTranslation';
import { palette, Radius, Shadows } from '@/constants/Colors';

interface ScenePlayerProps {
  scene: Scene;
  onComplete?: () => void;
}

function YouTubePlayerWeb({ scene, onStateChange, onTimeUpdate, onError }: {
  scene: Scene;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
  onError?: (code: number) => void;
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

function YouTubePlayerNative({ scene, onStateChange, onTimeUpdate, onError }: {
  scene: Scene;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
  onError?: (code: number) => void;
}) {
  const YoutubePlayer = require('react-native-youtube-iframe').default;
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  const onReady = useCallback(() => {
    setPlaying(true);
  }, []);

  const onChangeState = useCallback((state: string) => {
    if (state === 'playing') {
      onStateChange('playing');
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        const t = await playerRef.current?.getCurrentTime();
        if (t != null) onTimeUpdate?.(t);
      }, 250);
    } else if (state === 'paused') {
      onStateChange('paused');
      clearInterval(intervalRef.current);
    } else if (state === 'ended') {
      onStateChange('ended');
      clearInterval(intervalRef.current);
    }
  }, [onStateChange, onTimeUpdate]);

  return (
    <View style={styles.videoContainer}>
      <YoutubePlayer
        ref={playerRef}
        height={screenW * 9 / 16}
        width={screenW}
        videoId={scene.youtubeVideoId}
        play={playing}
        onReady={onReady}
        onChangeState={onChangeState}
        onError={(e: string) => onError?.(parseInt(e) || 0)}
        initialPlayerParams={{
          start: scene.startTime,
          end: scene.endTime,
          modestbranding: true,
          rel: false,
          cc_lang_pref: 'en',
        }}
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

function getVisibleWordCount(
  line: Scene['lines'][0],
  currentTime: number,
  wordTimestamps?: import('@/data/scenes').WordTimestamp[],
): number {
  if (line.lineStartTime == null || line.lineEndTime == null) return 0;

  // Use per-word timestamps if available (from YouTube auto-caption alignment)
  if (wordTimestamps && wordTimestamps.length > 0) {
    let count = 0;
    for (const wt of wordTimestamps) {
      if (currentTime >= wt.startTime) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  // Fallback: linear interpolation
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
  const [error, setError] = useState<number | null>(null); // useState for YouTube error code
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
        onError={(code) => setError(code)}
      />

      {/* Error overlay - video unavailable (error 150/153 = not embeddable) */}
      {error != null && (
        <View style={styles.errorOverlay}>
          <Pressable
            style={({ pressed }) => [styles.errorButton, pressed && { opacity: 0.8 }]}
            onPress={() => Linking.openURL('https://youtube.com/watch?v=' + scene.youtubeVideoId)}
          >
            <Text style={styles.errorButtonText}>Open on YouTube</Text>
          </Pressable>
        </View>
      )}

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
            const wordTs = scene.subtitleStatus === 'approved' ? getWordTimestamps(scene.id, lineIdx) : undefined;
            const visibleCount = isActive ? getVisibleWordCount(line, currentTime, wordTs) : 0;

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

  // Error overlay
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(11, 13, 23, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  errorTitle: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorCode: {
    color: palette.textMuted,
    fontSize: 12,
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: palette.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: Radius.md,
  },
  errorButtonText: {
    color: palette.bg,
    fontSize: 14,
    fontWeight: '700',
  },
});
