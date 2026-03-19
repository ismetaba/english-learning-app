import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Dimensions, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import { palette, Radius, Shadows, BlockColors } from '../../constants/Colors';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp {
  word: string;
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

interface LessonSentence {
  id: number;
  text: string;
  speaker: string;
  start_time: number;
  end_time: number;
  youtube_video_id: string;
  movie_title: string;
  words?: WordTimestamp[];
  grammar_annotations: GrammarAnnotation[];
  translations: Translation[];
}

interface LessonData {
  id: number;
  title: string;
  title_tr: string | null;
  description: string | null;
  level: string;
  grammar_focus: string | null;
  sentences: LessonSentence[];
}

interface Props {
  lesson: LessonData;
  onComplete?: () => void;
}

// ── Grammar colors ─────────────────────────────────────────────

const GRAMMAR_COLORS = {
  subject:   { bg: 'rgba(124, 106, 255, 0.2)', border: 'rgba(124, 106, 255, 0.5)', text: '#A594FF' },
  auxiliary: { bg: 'rgba(255, 179, 71, 0.2)',   border: 'rgba(255, 179, 71, 0.5)',  text: '#FFB347' },
  predicate: { bg: 'rgba(0, 212, 170, 0.2)',    border: 'rgba(0, 212, 170, 0.5)',   text: '#5DFFC8' },
};

const GRAMMAR_LABELS = {
  subject:   { en: 'Subject', tr: 'Ozne' },
  auxiliary: { en: 'Aux Verb', tr: 'Yrd. Fiil' },
  predicate: { en: 'Rest', tr: 'Devami' },
};

// ── Component ──────────────────────────────────────────────────

export default function LessonPlayer({ lesson, onComplete }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [sentenceHeard, setSentenceHeard] = useState(false);
  const [completedSentences, setCompletedSentences] = useState<Set<number>>(new Set());
  const playerRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const sentence = lesson.sentences[currentIdx];
  const isWeb = Platform.OS === 'web';
  const { width: screenW } = Dimensions.get('window');
  const totalSentences = lesson.sentences.length;
  const progress = totalSentences > 0 ? (completedSentences.size / totalSentences) : 0;

  // ── YouTube player (web) ────────────────────────────────────

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined' || !sentence) return;
    let destroyed = false;

    const create = () => {
      if (destroyed) return;
      const container = document.getElementById('lesson-player');
      if (!container) return;

      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = new (window as any).YT.Player('lesson-player', {
        videoId: sentence.youtube_video_id,
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, start: Math.floor(sentence.start_time) },
        events: {
          onReady: () => {
            if (!destroyed) {
              playerRef.current?.seekTo?.(sentence.start_time, true);
              playerRef.current?.playVideo?.();
            }
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.();
                if (t != null && !destroyed) setCurrentTime(t);
              }, 80);
            } else {
              setIsPlaying(false);
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      create();
    } else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); create(); };
    }

    return () => { destroyed = true; clearInterval(intervalRef.current); };
  }, [sentence?.youtube_video_id, currentIdx]);

  // ── Auto-pause when sentence ends ───────────────────────────

  useEffect(() => {
    if (!sentence || showPopup || sentenceHeard) return;
    if (currentTime >= sentence.end_time - 0.1) {
      // Sentence finished speaking — pause and show popup
      if (isWeb) {
        playerRef.current?.pauseVideo?.();
      } else {
        webViewRef.current?.injectJavaScript?.('player.pauseVideo(); true;');
      }
      setSentenceHeard(true);
      setShowPopup(true);
    }
  }, [currentTime, sentence, showPopup, sentenceHeard]);

  // ── Controls ────────────────────────────────────────────────

  const replay = useCallback(() => {
    if (!sentence) return;
    setShowPopup(false);
    setSentenceHeard(false);
    if (isWeb) {
      playerRef.current?.seekTo?.(sentence.start_time, true);
      playerRef.current?.playVideo?.();
    } else {
      webViewRef.current?.injectJavaScript?.(`player.seekTo(${sentence.start_time}, true); player.playVideo(); true;`);
    }
  }, [sentence, isWeb]);

  const goNext = useCallback(() => {
    setShowPopup(false);
    setSentenceHeard(false);
    setCompletedSentences(prev => new Set(prev).add(currentIdx));

    if (currentIdx < totalSentences - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onComplete?.();
    }
  }, [currentIdx, totalSentences, onComplete]);

  // ── Word rendering with grammar colors ──────────────────────

  const renderColoredWords = (large: boolean = false) => {
    if (!sentence) return null;
    const words = sentence.text.split(' ');
    const annots = sentence.grammar_annotations || [];
    const translations = sentence.translations || [];

    return (
      <View style={styles.wordsContainer}>
        {words.map((word, i) => {
          const annot = annots.find(a => a.word_index === i);
          const role = annot?.role;
          const color = role ? GRAMMAR_COLORS[role] : null;
          const tr = translations.find(t => t.word.toLowerCase() === word.toLowerCase().replace(/[.,!?;:]/g, ''));

          return (
            <View key={i} style={styles.wordGroup}>
              <View style={[
                styles.wordChip,
                large && styles.wordChipLarge,
                color && { backgroundColor: color.bg, borderColor: color.border, borderWidth: 1.5 },
              ]}>
                <Text style={[
                  styles.wordText,
                  large && styles.wordTextLarge,
                  color && { color: color.text },
                ]}>
                  {word}
                </Text>
              </View>
              {large && tr && (
                <Text style={styles.translationText}>{tr.tr}</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  if (!sentence) return null;

  // ── Popup overlay ───────────────────────────────────────────

  const PopupContent = () => (
    <View style={styles.popupOverlay}>
      <View style={styles.popupCard}>
        {/* Header */}
        <View style={styles.popupHeader}>
          <Text style={styles.popupMovieTitle}>{sentence.movie_title}</Text>
          <View style={styles.popupBadge}>
            <Text style={styles.popupBadgeText}>{currentIdx + 1} / {totalSentences}</Text>
          </View>
        </View>

        {/* Grammar legend */}
        <View style={styles.legendRow}>
          {(['subject', 'auxiliary', 'predicate'] as const).map(role => {
            const hasRole = sentence.grammar_annotations?.some(a => a.role === role);
            if (!hasRole) return null;
            const color = GRAMMAR_COLORS[role];
            return (
              <View key={role} style={[styles.legendItem, { backgroundColor: color.bg, borderColor: color.border, borderWidth: 1 }]}>
                <View style={[styles.legendDot, { backgroundColor: color.text }]} />
                <Text style={[styles.legendLabel, { color: color.text }]}>{GRAMMAR_LABELS[role].tr}</Text>
              </View>
            );
          })}
        </View>

        {/* Colored sentence with translations */}
        {renderColoredWords(true)}

        {/* Buttons */}
        <View style={styles.popupButtons}>
          <TouchableOpacity style={styles.replayButton} onPress={replay} activeOpacity={0.7}>
            <Text style={styles.replayIcon}>🔄</Text>
            <Text style={styles.replayText}>Tekrar Dinle</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueButton} onPress={goNext} activeOpacity={0.7}>
            <Text style={styles.continueText}>
              {currentIdx < totalSentences - 1 ? 'Devam Et' : 'Tamamla'}
            </Text>
            <Text style={styles.continueArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Main render ─────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Video */}
      <View style={styles.videoContainer}>
        {isWeb ? (
          <div id="lesson-player" style={{ width: '100%', height: '100%' }} />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: getNativePlayerHtml(sentence.youtube_video_id, sentence.start_time) }}
            style={{ flex: 1 }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onMessage={(e) => {
              try {
                const data = JSON.parse(e.nativeEvent.data);
                if (data.currentTime != null) setCurrentTime(data.currentTime);
                if (data.state === 'playing') setIsPlaying(true);
                if (data.state === 'paused') setIsPlaying(false);
              } catch {}
            }}
          />
        )}
      </View>

      {/* Current sentence (below video) */}
      <View style={styles.sentenceBar}>
        <View style={styles.sentenceInfo}>
          <Text style={styles.sentenceCounter}>{currentIdx + 1}/{totalSentences}</Text>
          <Text style={styles.sentenceMovie}>{sentence.movie_title}</Text>
        </View>
        {renderColoredWords(false)}
      </View>

      {/* Popup */}
      {showPopup && <PopupContent />}
    </View>
  );
}

// ── Native HTML player ────────────────────────────────────────

function getNativePlayerHtml(videoId: string, startTime: number): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#000}#player{width:100vw;height:100vh}</style></head><body>
<div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var player;
function onYouTubeIframeAPIReady(){
  player=new YT.Player('player',{
    videoId:'${videoId}',
    playerVars:{controls:0,modestbranding:1,rel:0,playsinline:1,start:${Math.floor(startTime)}},
    events:{
      onReady:function(){player.seekTo(${startTime},true);player.playVideo()},
      onStateChange:function(e){
        var s=e.data===YT.PlayerState.PLAYING?'playing':e.data===YT.PlayerState.PAUSED?'paused':'other';
        window.ReactNativeWebView.postMessage(JSON.stringify({state:s}));
      }
    }
  });
  setInterval(function(){
    if(player&&player.getCurrentTime){
      window.ReactNativeWebView.postMessage(JSON.stringify({currentTime:player.getCurrentTime()}));
    }
  },80);
}
</script></body></html>`;
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  progressBar: {
    height: 3,
    backgroundColor: palette.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },

  // Sentence bar
  sentenceBar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  sentenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sentenceCounter: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  sentenceMovie: {
    fontSize: 10,
    color: palette.textMuted,
  },

  // Words
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  wordGroup: {
    alignItems: 'center',
  },
  wordChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wordChipLarge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  wordText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  wordTextLarge: {
    fontSize: 17,
    fontWeight: '600',
  },
  translationText: {
    fontSize: 10,
    color: palette.textMuted,
    marginTop: 2,
  },

  // Popup
  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100,
  },
  popupCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: palette.border,
    ...Shadows.card,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  popupMovieTitle: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: '600',
  },
  popupBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  popupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
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

  // Buttons
  popupButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  replayButton: {
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
  continueButton: {
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
});
