import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { Clip } from '@/data/clips';
import { palette, Radius } from '@/constants/Colors';

interface ClipPlayerProps {
  clip: Clip;
  clipIndex: number;
  totalClips: number;
  vocabFocus: string[];
  onClipEnd: () => void;
}

// ── YouTube Player (Web) ────────────────────────────────────────

function YouTubePlayerWeb({ clip, onStateChange, onTimeUpdate }: {
  clip: Clip;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
}) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const containerRef = useRef<string>(`yt-clip-${Date.now()}`);

  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const initPlayer = () => {
      // Remove old player if exists
      playerRef.current?.destroy?.();
      clearInterval(intervalRef.current);

      const el = document.getElementById(containerRef.current);
      if (!el) return;

      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        videoId: clip.youtubeVideoId,
        playerVars: {
          start: Math.floor(clip.startTime),
          end: Math.ceil(clip.endTime),
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          cc_load_policy: 1,
          cc_lang_pref: 'en',
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
                  onTimeUpdate?.(t);
                  // Force end when past clip endTime
                  if (t >= clip.endTime) {
                    clearInterval(intervalRef.current);
                    playerRef.current?.pauseVideo?.();
                    onStateChange('ended');
                  }
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
  }, [clip.youtubeVideoId, clip.startTime, clip.endTime]);

  return (
    <View style={styles.videoContainer}>
      <div id={containerRef.current} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

// ── YouTube Player (Native) ─────────────────────────────────────

function YouTubePlayerNative({ clip, onStateChange, onTimeUpdate }: {
  clip: Clip;
  onStateChange: (state: 'playing' | 'paused' | 'ended') => void;
  onTimeUpdate?: (time: number) => void;
}) {
  const WebView = require('react-native-webview').default;
  const webViewRef = useRef<any>(null);

  const youtubeHtml = `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <style>* { margin: 0; padding: 0; } body { background: #000; overflow: hidden; } #player { width: 100vw; height: 100vh; }</style>
    </head><body><div id="player"></div><script>
    var tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag);
    var player, timeInterval;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        videoId: '${clip.youtubeVideoId}',
        playerVars: { start: ${Math.floor(clip.startTime)}, end: ${Math.ceil(clip.endTime)}, controls: 1, modestbranding: 1, rel: 0, playsinline: 1, cc_load_policy: 1, cc_lang_pref: 'en', autoplay: 1 },
        events: { onStateChange: function(e) {
          if (e.data === YT.PlayerState.PLAYING) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'playing' }));
            clearInterval(timeInterval);
            timeInterval = setInterval(function() {
              var t = player.getCurrentTime();
              if (t != null) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeUpdate', time: t }));
                if (t >= ${clip.endTime}) { clearInterval(timeInterval); player.pauseVideo(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' })); }
              }
            }, 250);
          } else if (e.data === YT.PlayerState.PAUSED) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'paused' })); clearInterval(timeInterval); }
          else if (e.data === YT.PlayerState.ENDED) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' })); clearInterval(timeInterval); }
        }}
      });
    }
    </script></body></html>
  `;

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'timeUpdate') onTimeUpdate?.(data.time);
      else if (['playing', 'paused', 'ended'].includes(data.type)) onStateChange(data.type);
    } catch {}
  }, [onStateChange, onTimeUpdate]);

  return (
    <View style={styles.videoContainer}>
      <WebView ref={webViewRef} source={{ html: youtubeHtml }} style={styles.video} javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} onMessage={handleMessage} />
    </View>
  );
}

// ── Subtitle Helpers ────────────────────────────────────────────

function getActiveLineIndex(lines: Clip['lines'], currentTime: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.lineStartTime != null && line.lineEndTime != null) {
      if (currentTime >= line.lineStartTime && currentTime < line.lineEndTime) return i;
    }
  }
  return -1;
}

function getVisibleWordCount(line: Clip['lines'][0], currentTime: number): number {
  if (line.lineStartTime == null || line.lineEndTime == null) return 0;
  const words = line.text.split(' ');
  const duration = line.lineEndTime - line.lineStartTime;
  const elapsed = currentTime - line.lineStartTime;
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  return Math.ceil(progress * words.length);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── ClipPlayer Component ────────────────────────────────────────

export default function ClipPlayer({ clip, clipIndex, totalClips, vocabFocus, onClipEnd }: ClipPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [clipEnded, setClipEnded] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleStateChange = useCallback((state: 'playing' | 'paused' | 'ended') => {
    if (state === 'ended') setClipEnded(true);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Reset ended state when clip changes
  useEffect(() => {
    setClipEnded(false);
    setCurrentTime(0);
  }, [clip.id]);

  const PlayerComponent = Platform.OS === 'web' ? YouTubePlayerWeb : YouTubePlayerNative;
  const vocabWords = vocabFocus.map(w => w.toLowerCase());
  const activeLineIndex = getActiveLineIndex(clip.lines, currentTime);
  const duration = clip.endTime - clip.startTime;
  const elapsed = Math.max(0, Math.min(currentTime - clip.startTime, duration));
  const progressPercent = duration > 0 ? (elapsed / duration) * 100 : 0;
  const isLast = clipIndex >= totalClips - 1;

  return (
    <View style={styles.container}>
      {/* Video */}
      <PlayerComponent clip={clip} onStateChange={handleStateChange} onTimeUpdate={handleTimeUpdate} />

      {/* Info bar */}
      <View style={styles.infoBar}>
        <View style={styles.infoLeft}>
          <Text style={styles.movieTitle}>{clip.movieTitle}</Text>
          <View style={styles.metaRow}>
            <View style={styles.clipBadge}>
              <Text style={styles.clipBadgeText}>Clip {clipIndex + 1}/{totalClips}</Text>
            </View>
            <Text style={styles.timeText}>{formatTime(elapsed)} / {formatTime(duration)}</Text>
          </View>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Transcript */}
      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>DIALOGUE</Text>
          <View style={styles.vocabChips}>
            {vocabFocus.slice(0, 5).map((word, i) => (
              <View key={i} style={styles.vocabChip}>
                <Text style={styles.vocabChipText}>{word}</Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView ref={scrollViewRef} style={styles.transcriptScroll} showsVerticalScrollIndicator={false}>
          {clip.lines.map((line, lineIdx) => {
            const isActive = lineIdx === activeLineIndex;
            const isPast = line.lineEndTime != null && currentTime >= line.lineEndTime;
            const words = line.text.split(' ');
            const visibleCount = isActive ? getVisibleWordCount(line, currentTime) : 0;

            return (
              <View key={lineIdx} style={[styles.lineRow, isActive && styles.lineRowActive]}>
                <View style={styles.timelineCol}>
                  <View style={[styles.timelineDot, isActive && styles.timelineDotActive, isPast && styles.timelineDotPast]} />
                  {lineIdx < clip.lines.length - 1 && <View style={[styles.timelineLine, isPast && styles.timelineLinePast]} />}
                </View>
                <View style={styles.lineContent}>
                  <View style={styles.lineMeta}>
                    <Text style={[styles.speakerName, isActive && styles.speakerNameActive]}>{line.speaker}</Text>
                    {line.lineStartTime != null && <Text style={styles.lineTimestamp}>{formatTime(line.lineStartTime)}</Text>}
                  </View>
                  <Text style={[styles.lineText, isActive && styles.lineTextActive, isPast && styles.lineTextPast]}>
                    {isActive ? words.map((word, idx) => {
                      const clean = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
                      const isVocab = vocabWords.some(v => clean === v || clean === v + 's' || clean === v + 'ing' || clean === v + 'ed');
                      const isRevealed = idx < visibleCount;
                      return <Text key={idx} style={[isRevealed ? styles.wordRevealed : styles.wordPending, isVocab && isRevealed && styles.wordVocab]}>{word}{' '}</Text>;
                    }) : words.map((word, idx) => {
                      const clean = word.replace(/[^a-zA-Z']/g, '').toLowerCase();
                      const isVocab = vocabWords.some(v => clean === v);
                      return <Text key={idx} style={isVocab ? styles.wordVocab : undefined}>{word}{' '}</Text>;
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={{ height: 80 }} />
        </ScrollView>
      </View>

      {/* Next clip button overlay */}
      {clipEnded && (
        <View style={styles.nextOverlay}>
          <Pressable
            style={({ pressed }) => [styles.nextButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={onClipEnd}
          >
            <Text style={styles.nextButtonText}>
              {isLast ? '🎉 Complete!' : `▶ Next: ${clipIndex + 2}/${totalClips}`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  videoContainer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },

  infoBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: palette.bgCard },
  infoLeft: { flex: 1 },
  movieTitle: { color: palette.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clipBadge: { backgroundColor: palette.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.xs },
  clipBadgeText: { color: palette.accent, fontSize: 11, fontWeight: '600' },
  timeText: { color: palette.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },

  progressBarTrack: { height: 3, backgroundColor: palette.bgSurface },
  progressBarFill: { height: 3, backgroundColor: palette.accent },

  transcriptContainer: { flex: 1, backgroundColor: palette.bgElevated },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.border },
  transcriptLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  transcriptScroll: { flex: 1, paddingTop: 8 },

  lineRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  lineRowActive: { backgroundColor: palette.accentSoft },
  timelineCol: { width: 20, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.bgSurface, marginTop: 6 },
  timelineDotActive: { backgroundColor: palette.accent, width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  timelineDotPast: { backgroundColor: palette.accent },
  timelineLine: { width: 2, flex: 1, backgroundColor: palette.border, marginTop: 4 },
  timelineLinePast: { backgroundColor: palette.accentSoft },

  lineContent: { flex: 1 },
  lineMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  speakerName: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  speakerNameActive: { color: palette.accent },
  lineTimestamp: { color: palette.textDisabled, fontSize: 10, fontVariant: ['tabular-nums'] },
  lineText: { color: palette.textSecondary, fontSize: 15, lineHeight: 24 },
  lineTextActive: { color: palette.textPrimary, fontSize: 16, lineHeight: 26 },
  lineTextPast: { color: palette.textMuted },

  wordRevealed: { color: palette.textPrimary },
  wordPending: { color: palette.textDisabled },
  wordVocab: { color: palette.xp, fontWeight: '700' },

  vocabChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  vocabChip: { backgroundColor: palette.bgSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: palette.border },
  vocabChipText: { color: palette.xp, fontSize: 11, fontWeight: '600' },

  nextOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: 'rgba(11, 13, 23, 0.9)' },
  nextButton: { backgroundColor: palette.accent, paddingVertical: 16, borderRadius: Radius.lg, alignItems: 'center' },
  nextButtonText: { color: palette.bg, fontSize: 16, fontWeight: '700' },
});
