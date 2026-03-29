import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  LayoutRectangle,
} from 'react-native';
import { palette, Radius, Shadows, Spacing } from '@/constants/Colors';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}

interface SubtitleLine {
  text: string;
  startTime: number;
  endTime: number;
  words?: WordTimestamp[];
}

export interface TargetClip {
  id: number;
  youtubeVideoId: string;
  movieTitle: string;
  startTime: number;
  endTime: number;
  targetText: string;
  targetStartTime: number;
  targetEndTime: number;
  targetTranslation: string;
  lines: SubtitleLine[];
  wordTranslations: Record<string, string>;
}

interface Props {
  clips: TargetClip[];
  lessonTitle: string;
  onComplete: () => void;
  onBack: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getActiveLineIndex(lines: SubtitleLine[], currentTime: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].startTime && currentTime < lines[i].endTime) return i;
  }
  return -1;
}

function isTargetLine(line: SubtitleLine, clip: TargetClip): boolean {
  return (
    Math.abs(line.startTime - clip.targetStartTime) < 0.5 &&
    line.text === clip.targetText
  );
}

/** Word-by-word karaoke: is word at index revealed? */
function isWordRevealed(line: SubtitleLine, wordIdx: number, currentTime: number, isPaused: boolean): boolean {
  if (isPaused) return true; // Show all words when paused
  // Use word timestamps if available
  if (line.words && line.words[wordIdx]) {
    return currentTime >= line.words[wordIdx].startTime;
  }
  // Fallback: linear interpolation
  const words = line.text.split(' ');
  const duration = line.endTime - line.startTime;
  const perWord = duration / words.length;
  return currentTime >= line.startTime + wordIdx * perWord;
}

// ── YouTube Player (Web) ───────────────────────────────────────

function YouTubePlayerWeb({
  clip,
  playerRef,
  onStateChange,
  onTimeUpdate,
}: {
  clip: TargetClip;
  playerRef: React.MutableRefObject<any>;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate: (time: number) => void;
}) {
  const intervalRef = useRef<any>(null);
  const containerRef = useRef<string>(`yt-lesson-${Date.now()}`);

  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const initPlayer = () => {
      playerRef.current?.destroy?.();
      clearInterval(intervalRef.current);

      const el = document.getElementById(containerRef.current);
      if (!el) return;

      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        videoId: clip.youtubeVideoId,
        playerVars: {
          start: Math.floor(clip.startTime),
          end: Math.ceil(clip.endTime),
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          autoplay: 1,
        },
        events: {
          onStateChange: (e: any) => {
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              onStateChange('playing');
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.();
                if (t != null) {
                  onTimeUpdate(t);
                  if (t >= clip.endTime) {
                    clearInterval(intervalRef.current);
                    playerRef.current?.pauseVideo?.();
                    onStateChange('ended');
                  }
                }
              }, 100);
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
  }, [clip.youtubeVideoId, clip.startTime, clip.endTime]);

  return (
    <View style={styles.videoContainer}>
      <div id={containerRef.current} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

// ── YouTube Player (Native placeholder) ────────────────────────

function YouTubePlayerNative({
  clip,
}: {
  clip: TargetClip;
  playerRef: React.MutableRefObject<any>;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate: (time: number) => void;
}) {
  return (
    <View style={[styles.videoContainer, styles.nativePlaceholder]}>
      <Text style={styles.nativePlaceholderText}>
        Video Player{'\n'}
        {clip.movieTitle}
      </Text>
      <Text style={styles.nativePlaceholderSub}>
        Native video playback coming soon
      </Text>
    </View>
  );
}

// ── Word Popup ─────────────────────────────────────────────────

interface WordPopupProps {
  word: string;
  translation: string;
  position: { x: number; y: number };
  onDismiss: () => void;
}

function WordPopup({ word, translation, position, onDismiss }: WordPopupProps) {
  const timerRef = useRef<any>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  return (
    <Pressable style={styles.popupBackdrop} onPress={onDismiss}>
      <View
        style={[
          styles.wordPopup,
          { top: position.y - 60, left: Math.max(8, Math.min(position.x - 60, 260)) },
        ]}
      >
        <View style={styles.popupArrow} />
        <Text style={styles.popupWord}>{word}</Text>
        <Text style={styles.popupArrowChar}> → </Text>
        <Text style={styles.popupTranslation}>{translation}</Text>
      </View>
    </Pressable>
  );
}

// ── Target Sentence Card ───────────────────────────────────────

interface TargetCardProps {
  clip: TargetClip;
  onWordTap: (word: string, x: number, y: number) => void;
}

function TargetSentenceCard({ clip, onWordTap }: TargetCardProps) {
  const words = clip.targetText.split(' ');

  return (
    <View style={styles.targetCard}>
      <View style={styles.targetTextRow}>
        {words.map((word, idx) => {
          const cleanWord = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
          const hasTranslation = cleanWord in clip.wordTranslations;

          return (
            <Pressable
              key={idx}
              onPress={(e) => {
                const x = (e.nativeEvent as any).pageX ?? (e.nativeEvent as any).locationX ?? 120;
                const y = (e.nativeEvent as any).pageY ?? (e.nativeEvent as any).locationY ?? 200;
                onWordTap(word, x, y);
              }}
              style={({ pressed }) => [
                styles.tappableWord,
                hasTranslation && styles.tappableWordHighlight,
                pressed && styles.tappableWordPressed,
              ]}
            >
              <Text style={[styles.targetWordText, hasTranslation && styles.targetWordTextHighlight]}>
                {word}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.targetTranslation}>{clip.targetTranslation}</Text>
    </View>
  );
}

// ── Completion Screen ──────────────────────────────────────────

function CompletionScreen({ onComplete, lessonTitle }: { onComplete: () => void; lessonTitle: string }) {
  return (
    <View style={styles.completionContainer}>
      <View style={styles.completionContent}>
        <Text style={styles.completionIcon}>&#10003;</Text>
        <Text style={styles.completionTitle}>Watch Stage Complete</Text>
        <Text style={styles.completionSubtitle}>
          You have reviewed all target sentences for {lessonTitle}.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.completionButton, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={onComplete}
        >
          <Text style={styles.completionButtonText}>Continue to Practice</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function LessonClipPlayer({ clips, lessonTitle, onComplete, onBack }: Props) {
  const [clipIndex, setClipIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipEnded, setClipEnded] = useState(false);
  const [targetPaused, setTargetPaused] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [activePopup, setActivePopup] = useState<{
    word: string;
    translation: string;
    position: { x: number; y: number };
  } | null>(null);

  const hasPausedForTarget = useRef(false);
  const ytPlayerRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const clip = clips[clipIndex];
  const isLastClip = clipIndex >= clips.length - 1;

  // Reset state when clip changes
  useEffect(() => {
    setCurrentTime(0);
    setClipEnded(false);
    setTargetPaused(false);
    setReplaying(false);
    setActivePopup(null);
    hasPausedForTarget.current = false;
  }, [clipIndex]);

  // Auto-pause when reaching target sentence
  useEffect(() => {
    if (!clip) return;

    // During replay: pause when we pass through the target again
    if (replaying && currentTime > clip.targetStartTime && currentTime >= clip.targetEndTime - 0.2) {
      setReplaying(false);
      setTargetPaused(true);
      if (Platform.OS === 'web' && ytPlayerRef.current?.pauseVideo) {
        ytPlayerRef.current.pauseVideo();
      }
      return;
    }

    if (hasPausedForTarget.current || targetPaused || replaying) return;

    if (currentTime >= clip.targetStartTime && currentTime < clip.targetEndTime) {
      hasPausedForTarget.current = true;
      setTargetPaused(true);
      if (Platform.OS === 'web' && ytPlayerRef.current?.pauseVideo) {
        ytPlayerRef.current.pauseVideo();
      }
    }
  }, [currentTime, clip, targetPaused, replaying]);

  const handleStateChange = useCallback(
    (state: 'playing' | 'paused' | 'ended') => {
      if (state === 'ended') setClipEnded(true);
    },
    [],
  );

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleReplay = useCallback(() => {
    if (replaying || !clip) return;
    setActivePopup(null);
    setReplaying(true);
    setTargetPaused(false);

    // Seek back to 3s before the target
    const seekPos = Math.max(clip.startTime, clip.targetStartTime - 3);
    setCurrentTime(seekPos);

    if (Platform.OS === 'web' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(seekPos, true);
      ytPlayerRef.current.playVideo();
    }
  }, [clip, replaying]);

  const handleContinuePlayback = useCallback(() => {
    setTargetPaused(false);
    setReplaying(false);
    setActivePopup(null);

    if (Platform.OS === 'web' && ytPlayerRef.current?.playVideo) {
      ytPlayerRef.current.playVideo();
    }
  }, []);

  const handleNextClip = useCallback(() => {
    if (isLastClip) {
      setAllDone(true);
    } else {
      setClipIndex((prev) => prev + 1);
    }
  }, [isLastClip]);

  const handleWordTap = useCallback(
    (word: string, x: number, y: number) => {
      const cleanWord = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const translation = clip.wordTranslations[cleanWord];
      if (translation) {
        setActivePopup({
          word: cleanWord,
          translation,
          position: { x, y },
        });
      }
    },
    [clip],
  );

  const handleDismissPopup = useCallback(() => {
    setActivePopup(null);
  }, []);

  // Show completion screen
  if (allDone) {
    return <CompletionScreen onComplete={onComplete} lessonTitle={lessonTitle} />;
  }

  if (!clip) return null;

  const PlayerComponent = Platform.OS === 'web' ? YouTubePlayerWeb : YouTubePlayerNative;
  const activeLineIndex = getActiveLineIndex(clip.lines, currentTime);
  const duration = clip.endTime - clip.startTime;
  const elapsed = Math.max(0, Math.min(currentTime - clip.startTime, duration));
  const progressPercent = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Back</Text>
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {clip.movieTitle}
        </Text>
        <View style={styles.clipBadge}>
          <Text style={styles.clipBadgeText}>
            {clipIndex + 1}/{clips.length}
          </Text>
        </View>
      </View>

      {/* Video */}
      <PlayerComponent
        clip={clip}
        playerRef={ytPlayerRef}
        onStateChange={handleStateChange}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        {/* Target region marker */}
        {duration > 0 && (
          <View
            style={[
              styles.targetRegionMarker,
              {
                left: `${((clip.targetStartTime - clip.startTime) / duration) * 100}%`,
                width: `${((clip.targetEndTime - clip.targetStartTime) / duration) * 100}%`,
              },
            ]}
          />
        )}
      </View>

      {/* Info bar */}
      <View style={styles.infoBar}>
        <Text style={styles.lessonTitleText} numberOfLines={1}>
          {lessonTitle}
        </Text>
        <Text style={styles.timeText}>
          {formatTime(elapsed)} / {formatTime(duration)}
        </Text>
      </View>

      {/* Subtitle / Transcript area */}
      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>DIALOGUE</Text>
          <Text style={styles.transcriptHint}>Tap words for translation</Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.transcriptScroll}
          showsVerticalScrollIndicator={false}
        >
          {clip.lines.map((line, lineIdx) => {
            const isActive = lineIdx === activeLineIndex;
            const isPast = currentTime >= line.endTime;
            const isTarget = isTargetLine(line, clip);
            const showTargetCard = isTarget && targetPaused;

            if (showTargetCard) {
              const words = clip.targetText.split(' ');
              return (
                <View key={lineIdx} style={styles.targetArea}>
                  {/* Turkish translation line */}
                  {clip.targetTranslation ? (
                    <Text style={styles.trLine}>{clip.targetTranslation}</Text>
                  ) : null}

                  {/* Tappable English words */}
                  <View style={styles.targetWords}>
                    {words.map((word, wIdx) => {
                      const clean = word.replace(/[.,!?;:'"]/g, '').toLowerCase();
                      const tr = clip.wordTranslations[clean];
                      const isTapped = activePopup?.word === word;

                      return (
                        <Pressable
                          key={wIdx}
                          onPress={(e) => {
                            if (tr) handleWordTap(word, e.nativeEvent.pageX, e.nativeEvent.pageY);
                          }}
                          style={[
                            styles.targetWordChip,
                            tr ? styles.targetWordChipTranslatable : null,
                          ]}
                        >
                          {isTapped && tr ? (
                            <Text style={styles.targetWordTr}>{tr}</Text>
                          ) : null}
                          <Text style={styles.targetWordText}>{word}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Counter */}
                  <View style={styles.targetCounter}>
                    <Text style={styles.targetCounterText}>
                      {clipIndex + 1}/{clips.length}
                    </Text>
                  </View>

                  {/* Tekrar Dinle + Devam Et buttons (same as Dersler) */}
                  <View style={styles.inlineButtons}>
                    <Pressable
                      style={[styles.replayBtn, replaying && { opacity: 0.4 }]}
                      onPress={handleReplay}
                      disabled={replaying}
                    >
                      <Text style={styles.replayIcon}>{replaying ? '...' : '🔄'}</Text>
                      <Text style={styles.replayText}>{replaying ? 'Dinleniyor...' : 'Tekrar Dinle'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.continueBtn, replaying && { opacity: 0.4 }]}
                      onPress={handleContinuePlayback}
                      disabled={replaying}
                    >
                      <Text style={styles.continueText}>Devam Et</Text>
                      <Text style={styles.continueArrow}>→</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={lineIdx}
                style={[
                  styles.lineRow,
                  isActive && styles.lineRowActive,
                  isTarget && !targetPaused && styles.lineRowTarget,
                ]}
              >
                <View style={styles.timelineCol}>
                  <View
                    style={[
                      styles.timelineDot,
                      isActive && styles.timelineDotActive,
                      isPast && styles.timelineDotPast,
                      isTarget && styles.timelineDotTarget,
                    ]}
                  />
                  {lineIdx < clip.lines.length - 1 && (
                    <View style={[styles.timelineLine, isPast && styles.timelineLinePast]} />
                  )}
                </View>
                <View style={styles.lineContent}>
                  <View style={styles.lineMeta}>
                    <Text style={[styles.lineTimestamp, { textAlign: 'right' }]}>
                      {formatTime(line.startTime)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.lineText,
                      isActive && styles.lineTextActive,
                      isPast && styles.lineTextPast,
                      isTarget && styles.lineTextTarget,
                    ]}
                  >
                    {isActive ? (
                      line.text.split(' ').map((word, wIdx) => {
                        const revealed = isWordRevealed(line, wIdx, currentTime, false);
                        return (
                          <Text
                            key={wIdx}
                            style={revealed ? styles.wordRevealed : styles.wordPending}
                          >
                            {word}{' '}
                          </Text>
                        );
                      })
                    ) : isTarget && !isPast ? (
                      line.text.split(' ').map((word, wIdx) => (
                        <Text key={wIdx} style={styles.wordTarget}>{word}{' '}</Text>
                      ))
                    ) : (
                      line.text
                    )}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>

      {/* Word popup */}
      {activePopup && (
        <WordPopup
          word={activePopup.word}
          translation={activePopup.translation}
          position={activePopup.position}
          onDismiss={handleDismissPopup}
        />
      )}

      {/* Next clip button overlay (only when clip ends, not during target pause) */}
      {clipEnded && (
        <View style={styles.bottomOverlay}>
          <Pressable
            style={({ pressed }) => [styles.nextButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={handleNextClip}
          >
            <Text style={styles.nextButtonText}>
              {isLastClip ? 'Continue to Practice' : `Next Clip → ${clipIndex + 2}/${clips.length}`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: palette.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    paddingRight: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  backButtonText: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  topBarTitle: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  clipBadge: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  clipBadgeText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },

  // Video
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  nativePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  nativePlaceholderText: {
    color: palette.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  nativePlaceholderSub: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 8,
  },

  // Progress bar
  progressBarTrack: {
    height: 3,
    backgroundColor: palette.bgSurface,
    position: 'relative',
  },
  progressBarFill: {
    height: 3,
    backgroundColor: palette.accent,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  targetRegionMarker: {
    position: 'absolute',
    top: 0,
    height: 3,
    backgroundColor: palette.primaryGlow,
  },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: palette.bgCard,
  },
  lessonTitleText: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  timeText: {
    color: palette.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
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
    paddingHorizontal: Spacing.lg,
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
  transcriptHint: {
    color: palette.textDisabled,
    fontSize: 11,
    fontStyle: 'italic',
  },
  transcriptScroll: {
    flex: 1,
    paddingTop: Spacing.sm,
  },

  // Line rows
  lineRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  lineRowActive: {
    backgroundColor: palette.accentSoft,
  },
  lineRowTarget: {
    backgroundColor: palette.primarySoft,
  },

  // Timeline
  timelineCol: {
    width: 20,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.bgSurface,
    marginTop: 6,
  },
  timelineDotActive: {
    backgroundColor: palette.accent,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineDotPast: {
    backgroundColor: palette.accent,
  },
  timelineDotTarget: {
    backgroundColor: palette.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
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
  lineTextTarget: {
    color: palette.primaryLight,
    fontWeight: '600',
  },

  // Word-by-word karaoke
  wordRevealed: {
    color: palette.textPrimary,
  },
  wordPending: {
    color: palette.textDisabled,
  },
  wordTarget: {
    color: palette.primaryLight,
  },

  // Target area (CoursePlayer style — inline with Tekrar Dinle + Devam Et)
  targetArea: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: palette.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  trLine: {
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  targetWords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 10,
  },
  targetWordChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  targetWordChipTranslatable: {
    borderColor: palette.borderAccent,
    backgroundColor: palette.primarySoft,
  },
  targetWordText: {
    fontSize: 19,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  targetWordTr: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.accent,
    marginBottom: 2,
    textAlign: 'center',
  },
  targetCounter: {
    alignItems: 'center',
    marginBottom: 8,
  },
  targetCounterText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textMuted,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  replayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    backgroundColor: palette.bgSurface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  replayIcon: {
    fontSize: 14,
  },
  replayText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  continueBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    backgroundColor: palette.primary,
  },
  continueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  continueArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Word popup
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  wordPopup: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    zIndex: 101,
    ...Shadows.cardSmall,
  },
  popupArrow: {
    position: 'absolute',
    bottom: -6,
    left: 50,
    width: 12,
    height: 12,
    backgroundColor: palette.bgElevated,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.border,
    transform: [{ rotate: '45deg' }],
  },
  popupWord: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  popupArrowChar: {
    color: palette.textMuted,
    fontSize: 13,
    marginHorizontal: 4,
  },
  popupTranslation: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // Bottom overlay (shared)
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    backgroundColor: 'rgba(8, 10, 20, 0.92)',
  },

  // Continue button
  continueButton: {
    backgroundColor: palette.primary,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    ...Shadows.button,
  },
  continueButtonText: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Next button
  nextButton: {
    backgroundColor: palette.accent,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  nextButtonText: {
    color: palette.bg,
    fontSize: 16,
    fontWeight: '700',
  },

  // Completion screen
  completionContainer: {
    flex: 1,
    backgroundColor: palette.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  completionContent: {
    alignItems: 'center',
    maxWidth: 340,
  },
  completionIcon: {
    fontSize: 48,
    color: palette.accent,
    marginBottom: Spacing.xl,
  },
  completionTitle: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  completionSubtitle: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
  },
  completionButton: {
    backgroundColor: palette.accent,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: Radius.lg,
    alignItems: 'center',
    width: '100%',
  },
  completionButtonText: {
    color: palette.bg,
    fontSize: 16,
    fontWeight: '700',
  },
});
