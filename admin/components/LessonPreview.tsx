'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp { word: string; start_time: number; end_time: number; }
interface GrammarAnnotation { word_index: number; role: 'subject' | 'auxiliary' | 'predicate'; }
interface Translation { word: string; tr: string; }

interface Sentence {
  id: number;
  line_id: number;
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

interface Lesson {
  id: number;
  title: string;
  title_tr: string | null;
  level: string;
  grammar_focus: string | null;
  sentences: Sentence[];
}

const COLORS = {
  subject:   { bg: 'rgba(124,106,255,0.2)', border: 'rgba(124,106,255,0.6)', text: '#A594FF', label: 'Ozne (Subject)' },
  auxiliary: { bg: 'rgba(255,179,71,0.2)',   border: 'rgba(255,179,71,0.6)',  text: '#FFB347', label: 'Yrd. Fiil (Aux Verb)' },
  predicate: { bg: 'rgba(0,212,170,0.2)',    border: 'rgba(0,212,170,0.6)',   text: '#5DFFC8', label: 'Devami (Predicate)' },
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────────

export default function LessonPreview({ lesson }: { lesson: Lesson }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'popup' | 'done'>('playing');
  const [currentTime, setCurrentTime] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const hasTriggeredPause = useRef(false);
  const prevVideoIdRef = useRef<string | null>(null);

  const sentence = lesson.sentences[currentIdx];
  const total = lesson.sentences.length;
  const progress = total > 0 ? ((currentIdx + (phase === 'popup' ? 1 : 0)) / total) : 0;

  // ── Create / update YouTube player ──────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !sentence || phase === 'done') return;
    let destroyed = false;
    hasTriggeredPause.current = false;
    setLoadingVideo(true);

    const initPlayer = () => {
      if (destroyed) return;
      const container = document.getElementById('lesson-yt');
      if (!container) return;

      // Start 3 seconds before the sentence for context
      const seekTime = Math.max(0, sentence.start_time - 3);

      // If same video and player is still alive, just seek
      if (prevVideoIdRef.current === sentence.youtube_video_id && playerRef.current?.seekTo) {
        try {
          playerRef.current.seekTo(seekTime, true);
          playerRef.current.playVideo();
          setLoadingVideo(false);
          return;
        } catch {
          // Player died, fall through to recreate
        }
      }

      prevVideoIdRef.current = sentence.youtube_video_id;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;

      // Recreate the div since YT.Player replaces it with an iframe
      const parent = container.parentElement;
      if (parent && container.tagName === 'IFRAME') {
        const newDiv = document.createElement('div');
        newDiv.id = 'lesson-yt';
        newDiv.style.width = '100%';
        newDiv.style.height = '100%';
        parent.replaceChild(newDiv, container);
      }

      playerRef.current = new (window as any).YT.Player('lesson-yt', {
        videoId: sentence.youtube_video_id,
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, disablekb: 1, iv_load_policy: 3, autoplay: 1 },
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
                if (t != null && !destroyed) setCurrentTime(t);
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
  }, [sentence?.youtube_video_id, currentIdx, phase]);

  // ── Auto-pause when sentence ends ───────────────────────────

  useEffect(() => {
    if (!sentence || phase !== 'playing' || hasTriggeredPause.current) return;
    if (currentTime >= sentence.end_time - 0.05 && currentTime > sentence.start_time) {
      hasTriggeredPause.current = true;
      playerRef.current?.pauseVideo?.();
      setPhase('popup');
    }
  }, [currentTime, sentence, phase]);

  // ── Controls ────────────────────────────────────────────────

  const replay = useCallback(() => {
    if (!sentence) return;
    hasTriggeredPause.current = false;
    setPhase('playing');
    playerRef.current?.seekTo?.(Math.max(0, sentence.start_time - 1), true);
    playerRef.current?.playVideo?.();
  }, [sentence]);

  const goNext = useCallback(() => {
    if (currentIdx < total - 1) {
      hasTriggeredPause.current = false;
      setCurrentIdx(currentIdx + 1);
      setPhase('playing');
    } else {
      setPhase('done');
      playerRef.current?.pauseVideo?.();
    }
  }, [currentIdx, total]);

  // ── Done screen ─────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0B0D17] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-8">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold text-white mb-2">Lesson Complete!</h1>
          <p className="text-zinc-500 mb-6">{lesson.title}</p>
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-violet-500/15 text-violet-400 text-sm font-bold mb-8">
            {total} sentences practiced
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setCurrentIdx(0); setPhase('playing'); hasTriggeredPause.current = false; }}
              className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 transition-colors">
              Replay Lesson
            </button>
            <a href={`/lessons/${lesson.id}`}
              className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-semibold text-center hover:bg-violet-500 transition-colors">
              Back to Editor
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!sentence) return null;

  const words = sentence.text.split(' ');
  const annots = sentence.grammar_annotations || [];
  const translations = sentence.translations || [];

  // ── Word-level progress during playback ─────────────────────

  const getWordRevealed = (wordIdx: number): boolean => {
    if (phase === 'popup') return true;
    const wt = sentence.words?.[wordIdx];
    if (wt) return currentTime >= wt.start_time;
    // Linear fallback
    const dur = sentence.end_time - sentence.start_time;
    const perWord = dur / words.length;
    return currentTime >= sentence.start_time + wordIdx * perWord;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0D17] flex flex-col overflow-auto">
      {/* Progress bar */}
      <div className="h-1 bg-zinc-800 shrink-0">
        <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/30">
        <div className="flex items-center gap-3">
          <a href={`/lessons/${lesson.id}`} className="text-zinc-600 hover:text-white transition-colors text-sm">← Back</a>
          <span className="text-xs text-zinc-700">|</span>
          <span className="text-xs font-semibold text-zinc-500">{lesson.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full">
            {currentIdx + 1} / {total}
          </span>
        </div>
      </div>

      {/* Video + Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">

        {/* Video player */}
        <div className="w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden relative mb-6 shadow-2xl shadow-black/50">
          <div id="lesson-yt" className="w-full h-full" />
          {loadingVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Subtitle line (karaoke reveal while playing) */}
        {phase === 'playing' && (
          <div className="w-full max-w-3xl bg-[#141726] rounded-xl border border-zinc-800/40 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-zinc-700 bg-zinc-800 px-2 py-0.5 rounded">{sentence.movie_title}</span>
              <span className="text-[10px] font-mono text-zinc-700">{fmtTime(sentence.start_time)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {words.map((word, i) => {
                const revealed = getWordRevealed(i);
                return (
                  <span key={i} className={`text-lg font-medium transition-colors duration-100 ${revealed ? 'text-white' : 'text-zinc-800'}`}>
                    {word}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── POPUP ─────────────────────────────────────────── */}
        {phase === 'popup' && (
          <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-[#141726] rounded-2xl border border-zinc-800/40 overflow-hidden shadow-2xl shadow-violet-500/5">
              {/* Popup header */}
              <div className="px-6 py-4 border-b border-zinc-800/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-zinc-600 bg-zinc-800 px-2.5 py-1 rounded">{sentence.movie_title}</span>
                  <span className="text-[11px] font-mono text-zinc-700">{fmtTime(sentence.start_time)} - {fmtTime(sentence.end_time)}</span>
                </div>
                <span className="text-[11px] font-bold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full">
                  Sentence {currentIdx + 1} / {total}
                </span>
              </div>

              {/* Grammar legend */}
              <div className="px-6 pt-4 pb-2 flex items-center gap-2">
                {(['subject', 'auxiliary', 'predicate'] as const).map(role => {
                  const has = annots.some(a => a.role === role);
                  if (!has) return null;
                  const c = COLORS[role];
                  return (
                    <div key={role} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold"
                      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: c.text }} />
                      {c.label}
                    </div>
                  );
                })}
              </div>

              {/* Colored words with translations below */}
              <div className="px-6 py-5">
                <div className="flex flex-wrap gap-x-2 gap-y-6 justify-center">
                  {words.map((word, i) => {
                    const annot = annots.find(a => a.word_index === i);
                    const role = annot?.role;
                    const c = role ? COLORS[role] : null;
                    const tr = translations.find(t => t.word.toLowerCase() === word.toLowerCase().replace(/[.,!?;:'"]/g, ''));

                    return (
                      <div key={i} className="flex flex-col items-center">
                        <span
                          className="px-3 py-2 rounded-lg text-xl font-semibold transition-all"
                          style={c ? {
                            background: c.bg,
                            border: `2px solid ${c.border}`,
                            color: c.text,
                            textShadow: `0 0 20px ${c.border}`,
                          } : {
                            color: '#8B90B0',
                            border: '2px solid transparent',
                          }}>
                          {word}
                        </span>
                        {tr && (
                          <span className="mt-1.5 text-[11px] text-zinc-500 font-medium">{tr.tr}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 border-t border-zinc-800/30 flex gap-3">
                <button onClick={replay}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-all active:scale-[0.98]">
                  <span className="text-base">🔄</span>
                  <span className="text-sm font-semibold text-zinc-300">Tekrar Dinle</span>
                </button>
                <button onClick={goNext}
                  className="flex-[1.5] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-600/25 transition-all active:scale-[0.98]">
                  <span className="text-sm font-bold text-white">
                    {currentIdx < total - 1 ? 'Devam Et' : 'Tamamla'}
                  </span>
                  <span className="text-white font-bold">→</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
