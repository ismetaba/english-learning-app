import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Dimensions, ActivityIndicator,
} from 'react-native';
import { palette, Radius, Shadows } from '../../constants/Colors';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp {
  word: string;
  word_index: number;
  start_time: number;
  end_time: number;
}

interface GrammarAnnotation {
  word_index: number;
  role: 'subject' | 'auxiliary' | 'predicate';
}

interface Translation {
  word: string;
  tr: string;
}

interface SubtitleLine {
  id: number;
  text: string;
  speaker: string;
  start_time: number;
  end_time: number;
  words?: WordTimestamp[];
  is_target: boolean;
  grammar_annotations: GrammarAnnotation[] | null;
  translations: Translation[] | null;
}

interface ClipData {
  clip_id: number;
  youtube_video_id: string;
  movie_title: string;
  start_time: number;
  end_time: number;
  target_count: number;
  lines: SubtitleLine[];
}

interface CourseData {
  id: number;
  title: string;
  title_tr: string | null;
  level: string;
  grammar_focus: string | null;
  total_targets: number;
  clips: ClipData[];
}

interface Props {
  course: CourseData;
  onComplete?: () => void;
  onBack?: () => void;
}

// ── Grammar Colors ─────────────────────────────────────────────

const GRAMMAR_COLORS = {
  subject:   { bg: 'rgba(124,106,255,0.25)', border: 'rgba(124,106,255,0.6)', text: '#A594FF', glow: 'rgba(124,106,255,0.4)' },
  auxiliary: { bg: 'rgba(255,179,71,0.25)',   border: 'rgba(255,179,71,0.6)',  text: '#FFB347', glow: 'rgba(255,179,71,0.4)' },
  predicate: { bg: 'rgba(0,212,170,0.25)',    border: 'rgba(0,212,170,0.6)',   text: '#5DFFC8', glow: 'rgba(0,212,170,0.4)' },
};

const GRAMMAR_LABELS: Record<string, { en: string; tr: string }> = {
  subject:   { en: 'Subject', tr: 'Özne' },
  auxiliary: { en: 'Aux Verb', tr: 'Yrd. Fiil' },
  predicate: { en: 'Predicate', tr: 'Devamı' },
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────────

export default function CoursePlayer({ course, onComplete, onBack }: Props) {
  const [clipIdx, setClipIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'target-popup' | 'clip-done' | 'course-done'>('playing');
  const [playerReady, setPlayerReady] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [completedTargets, setCompletedTargets] = useState(0);
  const [tappedWordIdx, setTappedWordIdx] = useState<number | null>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const currentTargetRef = useRef<SubtitleLine | null>(null);
  const triggeredTargets = useRef<Set<number>>(new Set());
  const prevVideoIdRef = useRef<string | null>(null);
  const hasStartedPlaying = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const linePositionsRef = useRef<Record<number, number>>({});

  const clip = course.clips[clipIdx];
  const totalClips = course.clips.length;
  const progress = course.total_targets > 0 ? completedTargets / course.total_targets : 0;

  // Find the currently active subtitle line
  const activeLine = clip?.lines.find(
    l => currentTime >= l.start_time - 0.1 && currentTime <= l.end_time + 0.1
  );

  // ── Auto-scroll to active line ─────────────────────────────────

  useEffect(() => {
    if (activeLine && scrollRef.current) {
      const y = linePositionsRef.current[activeLine.id];
      if (y != null) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 40), animated: true });
      }
    }
  }, [activeLine?.id]);

  // ── YouTube Player ────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !clip) return;
    let destroyed = false;
    setLoadingVideo(true);
    hasStartedPlaying.current = false;

    const initPlayer = () => {
      if (destroyed) return;
      const container = document.getElementById('course-yt');
      if (!container) return;

      const seekTime = clip.start_time;

      // If same video, just seek
      if (prevVideoIdRef.current === clip.youtube_video_id && playerRef.current?.seekTo) {
        try {
          playerRef.current.seekTo(seekTime, true);
          playerRef.current.playVideo();
          setLoadingVideo(false);
          return;
        } catch { /* fall through */ }
      }

      prevVideoIdRef.current = clip.youtube_video_id;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;

      // Recreate div if it's now an iframe
      const parent = container.parentElement;
      if (parent && container.tagName === 'IFRAME') {
        const newDiv = document.createElement('div');
        newDiv.id = 'course-yt';
        newDiv.style.width = '100%';
        newDiv.style.height = '100%';
        parent.replaceChild(newDiv, container);
      }

      playerRef.current = new (window as any).YT.Player('course-yt', {
        videoId: clip.youtube_video_id,
        playerVars: {
          controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
          disablekb: 1, iv_load_policy: 3, autoplay: 1,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            setPlayerReady(true);
            setLoadingVideo(false);
            playerRef.current.seekTo(seekTime, true);
            playerRef.current.playVideo();
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.();
                if (t != null && !destroyed) {
                  setCurrentTime(t);
                  if (!hasStartedPlaying.current && t >= clip.start_time - 1) {
                    hasStartedPlaying.current = true;
                  }
                }
              }, 50);
            } else {
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      initPlayer();
    } else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); initPlayer(); };
    }

    return () => { destroyed = true; clearInterval(intervalRef.current); };
  }, [clip?.youtube_video_id, clipIdx]);

  // ── Auto-pause on target sentences ────────────────────────────

  useEffect(() => {
    if (!clip || phase !== 'playing' || !hasStartedPlaying.current) return;

    // Check if a target sentence just ended
    for (const line of clip.lines) {
      if (!line.is_target) continue;
      if (triggeredTargets.current.has(line.id)) continue;

      // Target sentence just finished
      if (currentTime >= line.end_time - 0.05 && currentTime > line.start_time) {
        triggeredTargets.current.add(line.id);
        currentTargetRef.current = line;
        playerRef.current?.pauseVideo?.();
        setPhase('target-popup');
        return;
      }
    }

    // Check if clip ended (all lines finished)
    const lastLine = clip.lines[clip.lines.length - 1];
    if (lastLine && currentTime >= lastLine.end_time + 0.5 && currentTime > clip.start_time + 2) {
      playerRef.current?.pauseVideo?.();
      setPhase('clip-done');
    }
  }, [currentTime, clip, phase]);

  // ── Controls ──────────────────────────────────────────────────

  const replay = useCallback(() => {
    const target = currentTargetRef.current;
    if (!target) return;
    // Remove from triggered so it can trigger again when the sentence ends
    triggeredTargets.current.delete(target.id);
    currentTargetRef.current = null;
    // Seek 3 seconds before the target sentence start
    const seekPos = Math.max(clip?.start_time ?? 0, target.start_time - 3);
    // Update currentTime immediately so auto-pause doesn't re-trigger on stale value
    setCurrentTime(seekPos);
    setTappedWordIdx(null);
    setPhase('playing');
    playerRef.current?.seekTo?.(seekPos, true);
    playerRef.current?.playVideo?.();
  }, [clip?.start_time]);

  const continueFromPopup = useCallback(() => {
    currentTargetRef.current = null;
    setCompletedTargets(prev => prev + 1);
    setTappedWordIdx(null);
    setPhase('playing');
    playerRef.current?.playVideo?.();
  }, []);

  const goNextClip = useCallback(() => {
    if (clipIdx < totalClips - 1) {
      triggeredTargets.current.clear();
      currentTargetRef.current = null;
      hasStartedPlaying.current = false;
      setCurrentTime(0);
      setClipIdx(clipIdx + 1);
      setPhase('playing');
    } else {
      setPhase('course-done');
    }
  }, [clipIdx, totalClips]);

  // ── Render: Course Complete ───────────────────────────────────

  if (phase === 'course-done') {
    return (
      <View style={styles.container}>
        <View style={styles.doneScreen}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>Ders Tamamlandı!</Text>
          <Text style={styles.doneSubtitle}>{course.title}</Text>
          <View style={styles.doneStats}>
            <View style={styles.doneStat}>
              <Text style={styles.doneStatNum}>{totalClips}</Text>
              <Text style={styles.doneStatLabel}>Video</Text>
            </View>
            <View style={[styles.doneStat, styles.doneStatAccent]}>
              <Text style={[styles.doneStatNum, { color: palette.primary }]}>{course.total_targets}</Text>
              <Text style={styles.doneStatLabel}>Cümle</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.doneBtn} onPress={onComplete || onBack} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!clip) return null;

  // ── Word-level karaoke reveal ─────────────────────────────────

  const getWordRevealed = (line: SubtitleLine, wordIdx: number): boolean => {
    if (phase === 'target-popup') return true;
    const wt = line.words?.[wordIdx];
    if (wt) return currentTime >= wt.start_time;
    const words = line.text.split(' ');
    const dur = line.end_time - line.start_time;
    const perWord = dur / words.length;
    return currentTime >= line.start_time + wordIdx * perWord;
  };

  // ── Render subtitle area (inline, no popup) ────────────────────

  const renderSubtitleArea = () => {
    // ── TARGET PAUSED: show grammar breakdown inline ──
    if (phase === 'target-popup' && currentTargetRef.current) {
      const target = currentTargetRef.current;
      const annots = target.grammar_annotations || [];
      const translations: Translation[] = Array.isArray(target.translations) ? target.translations : [];

      // Use translations array for word list (supports contraction splitting)
      // Fall back to text.split(' ') if no translations
      const words = translations.length > 0
        ? translations.map(t => t.word)
        : target.text.split(' ');

      // Build Turkish sentence from translations
      const trSentence = translations
        .map(t => t.tr)
        .filter(Boolean)
        .join(' ');

      return (
        <View style={styles.targetArea}>
          {/* Turkish translation line */}
          <Text style={styles.trLine}>{trSentence}</Text>

          {/* Grammar-colored English words (tap for Turkish) */}
          <View style={styles.targetWords}>
            {words.map((word, i) => {
              const annot = annots.find(a => a.word_index === i);
              const role = annot?.role;
              const c = role ? GRAMMAR_COLORS[role] : null;
              const tr = translations[i];
              const isTapped = tappedWordIdx === i;

              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={() => setTappedWordIdx(isTapped ? null : i)}
                  style={[
                    styles.targetWordChip,
                    c ? { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1.5 }
                      : { borderWidth: 1.5, borderColor: 'transparent' },
                  ]}
                >
                  {isTapped && tr?.tr ? (
                    <Text style={styles.targetWordTr}>{tr.tr}</Text>
                  ) : null}
                  <Text style={[
                    styles.targetWordText,
                    c ? { color: c.text } : { color: palette.textSecondary },
                  ]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Compact legend */}
          <View style={styles.legendRow}>
            {(['subject', 'auxiliary', 'predicate'] as const).map(role => {
              const has = annots.some(a => a.role === role);
              if (!has) return null;
              const c = GRAMMAR_COLORS[role];
              return (
                <View key={role} style={[styles.legendItem, { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1 }]}>
                  <View style={[styles.legendDot, { backgroundColor: c.text }]} />
                  <Text style={[styles.legendLabel, { color: c.text }]}>{GRAMMAR_LABELS[role].tr}</Text>
                </View>
              );
            })}
            <View style={{ flex: 1 }} />
            <View style={styles.targetBadge}>
              <Text style={styles.targetBadgeText}>{completedTargets + 1}/{course.total_targets}</Text>
            </View>
          </View>

          {/* Inline buttons */}
          <View style={styles.inlineButtons}>
            <TouchableOpacity style={styles.replayBtn} onPress={replay} activeOpacity={0.7}>
              <Text style={styles.replayIcon}>🔄</Text>
              <Text style={styles.replayText}>Tekrar Dinle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.continueBtn} onPress={continueFromPopup} activeOpacity={0.7}>
              <Text style={styles.continueText}>Devam Et</Text>
              <Text style={styles.continueArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Only show subtitle bar for non-target lines — targets are shown in the dialogue below
    return null;
  };

  // ── Clip transition screen ────────────────────────────────────

  if (phase === 'clip-done') {
    const nextClip = course.clips[clipIdx + 1];
    return (
      <View style={styles.container}>
        <View style={styles.clipDoneScreen}>
          <Text style={styles.clipDoneCheck}>✅</Text>
          <Text style={styles.clipDoneTitle}>Video {clipIdx + 1}/{totalClips} Tamamlandı</Text>
          <Text style={styles.clipDoneMovie}>{clip.movie_title}</Text>
          <Text style={styles.clipDoneTargets}>
            {clip.target_count} hedef cümle tamamlandı
          </Text>

          {nextClip && (
            <View style={styles.nextClipPreview}>
              <Text style={styles.nextClipLabel}>Sıradaki</Text>
              <Text style={styles.nextClipMovie}>{nextClip.movie_title}</Text>
              <Text style={styles.nextClipInfo}>{nextClip.target_count} hedef cümle · {nextClip.lines.length} satır</Text>
            </View>
          )}

          <TouchableOpacity style={styles.nextClipBtn} onPress={goNextClip} activeOpacity={0.8}>
            <Text style={styles.nextClipBtnText}>
              {clipIdx < totalClips - 1 ? 'Sonraki Video →' : 'Dersi Bitir 🎉'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main Layout ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{clip.movie_title}</Text>
        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>Video {clipIdx + 1}/{totalClips}</Text>
        </View>
      </View>

      {/* Video player */}
      <View style={styles.videoContainer}>
        {Platform.OS === 'web' ? (
          <div id="course-yt" style={{ width: '100%', height: '100%' }} />
        ) : null}
        {loadingVideo && (
          <View style={styles.videoLoading}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        )}
      </View>

      {/* Subtitle / target highlight area (inline, no overlay) */}
      {renderSubtitleArea()}

      {/* Dialogue transcript (ScenePlayer style) */}
      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>DIALOGUE</Text>
        </View>
        <ScrollView ref={scrollRef} style={styles.transcriptScroll} showsVerticalScrollIndicator={false}>
          {clip.lines.map((line, i) => {
            const isActive = activeLine?.id === line.id;
            const isPast = currentTime > line.end_time;
            const isTarget = line.is_target;
            const isTriggered = triggeredTargets.current.has(line.id);
            const words = line.text.split(' ');

            return (
              <View
                key={line.id}
                style={[styles.lineRow, isActive && styles.lineRowActive]}
                onLayout={(e) => { linePositionsRef.current[line.id] = e.nativeEvent.layout.y; }}
              >
                {/* Timeline dot + line */}
                <View style={styles.timelineCol}>
                  <View style={[
                    styles.timelineDot,
                    isActive && styles.timelineDotActive,
                    isPast && styles.timelineDotPast,
                    isTarget && !isPast && !isActive && styles.timelineDotTarget,
                    isTarget && isTriggered && styles.timelineDotPast,
                  ]} />
                  {i < clip.lines.length - 1 && (
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
                      isTarget && !isPast && styles.speakerNameTarget,
                    ]}>{line.speaker}</Text>
                    <Text style={styles.lineTimestamp}>{fmtTime(line.start_time)}</Text>
                  </View>
                  <Text style={[
                    styles.lineText,
                    isActive && styles.lineTextActive,
                    isPast && styles.lineTextPast,
                  ]}>
                    {isActive ? (
                      words.map((word, idx) => {
                        const revealed = getWordRevealed(line, idx);
                        const annot = isTarget ? line.grammar_annotations?.find(a => a.word_index === idx) : null;
                        const role = annot?.role;
                        const c = role ? GRAMMAR_COLORS[role] : null;
                        return (
                          <Text
                            key={idx}
                            style={[
                              revealed ? styles.wordRevealed : styles.wordPending,
                              revealed && c && { color: c.text, fontWeight: '700' },
                            ]}
                          >
                            {word}{' '}
                          </Text>
                        );
                      })
                    ) : isTarget && !isPast ? (
                      // Upcoming target: show in purple
                      words.map((word, idx) => (
                        <Text key={idx} style={styles.wordTarget}>{word}{' '}</Text>
                      ))
                    ) : (
                      line.text
                    )}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={{ height: 80 }} />
        </ScrollView>
      </View>

      {/* No overlay popup — grammar highlight is inline above */}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const { width: screenW } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // Progress
  progressBar: {
    height: 3,
    backgroundColor: palette.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backText: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: '500',
  },
  topTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  topBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  topBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
  },

  // Video
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },

  // Subtitle bar (normal playback)
  subtitleBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    minHeight: 52,
    justifyContent: 'center',
  },
  subtitleEmpty: {
    color: 'transparent',
    fontSize: 16,
  },
  subtitleWords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  subtitleWord: {
    fontSize: 16,
    fontWeight: '500',
  },
  subtitleWordRevealed: {
    color: palette.textPrimary,
  },
  subtitleWordHidden: {
    color: palette.textDisabled,
  },
  subtitleWordTarget: {
    fontSize: 17,
    fontWeight: '600',
  },
  wordChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  targetIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    justifyContent: 'center',
  },
  targetDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.primary,
  },
  targetLabelSmall: {
    fontSize: 9,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Inline target area (when paused on a target sentence)
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
  },
  targetWordText: {
    fontSize: 19,
    fontWeight: '600',
  },
  targetWordTr: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.accent,
    marginBottom: 2,
    textAlign: 'center',
  },
  targetBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  targetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },

  // Transcript (ScenePlayer style)
  transcriptContainer: {
    flex: 1,
    backgroundColor: palette.bgElevated,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  timelineDotTarget: {
    backgroundColor: palette.primaryLight,
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
  speakerName: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  speakerNameActive: {
    color: palette.primary,
  },
  speakerNameTarget: {
    color: palette.primaryLight,
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
  wordTarget: {
    color: palette.primaryLight,
    fontWeight: '500',
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  // (popup styles removed — using inline target area now)
  replayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.md,
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
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: palette.primary,
    ...Shadows.button,
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

  // Clip done screen
  clipDoneScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  clipDoneCheck: {
    fontSize: 48,
    marginBottom: 16,
  },
  clipDoneTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  clipDoneMovie: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 4,
  },
  clipDoneTargets: {
    fontSize: 13,
    color: palette.primary,
    fontWeight: '600',
    marginBottom: 24,
  },
  nextClipPreview: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 16,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 24,
  },
  nextClipLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  nextClipMovie: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 2,
  },
  nextClipInfo: {
    fontSize: 12,
    color: palette.textSecondary,
  },
  nextClipBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: Radius.md,
    ...Shadows.button,
  },
  nextClipBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Course done
  doneScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  doneEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  doneTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  doneSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 24,
  },
  doneStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  doneStat: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: palette.border,
  },
  doneStatAccent: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primaryGlow,
  },
  doneStatNum: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  doneStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textMuted,
    marginTop: 2,
  },
  doneBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: Radius.md,
    ...Shadows.button,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
