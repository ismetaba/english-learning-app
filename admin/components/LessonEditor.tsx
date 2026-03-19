'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp { word: string; start_time: number; end_time: number; }

interface LessonSentence {
  id: number;
  lesson_id: number;
  line_id: number;
  sort_order: number;
  grammar_annotations: string | null;
  translations: string | null;
  text?: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  youtube_video_id?: string;
  movie_title?: string;
  words?: WordTimestamp[];
}

interface Lesson {
  id: number;
  title: string;
  title_tr: string | null;
  description: string | null;
  level: string;
  grammar_focus: string | null;
}

interface SearchResult {
  id: number;
  text: string;
  speaker: string;
  start_time: number;
  end_time: number;
  youtube_video_id: string;
  movie_title: string;
  words?: WordTimestamp[];
}

type GrammarRole = 'subject' | 'auxiliary' | 'predicate';

interface GrammarAnnotation { word_index: number; role: GrammarRole; }
interface Translation { word: string; tr: string; }

const ROLE_COLORS: Record<GrammarRole, { bg: string; text: string; border: string; label: string }> = {
  subject:   { bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/30', label: 'Subject (Ozne)' },
  auxiliary: { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-amber-500/30',  label: 'Aux Verb (Yrd. Fiil)' },
  predicate: { bg: 'bg-cyan-500/15',   text: 'text-cyan-300',   border: 'border-cyan-500/30',   label: 'Rest (Devami)' },
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────────

export default function LessonEditor({ lesson, initialSentences }: { lesson: Lesson; initialSentences: LessonSentence[] }) {
  const [sentences, setSentences] = useState(initialSentences);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingSentenceId, setEditingSentenceId] = useState<number | null>(null);
  const [currentRole, setCurrentRole] = useState<GrammarRole>('subject');
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const searchTimer = useRef<any>(null);

  // ── YouTube player ──────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !previewVideoId) return;
    let destroyed = false;
    const containerId = 'lesson-yt-player';

    const create = () => {
      if (destroyed || !document.getElementById(containerId)) return;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = new (window as any).YT.Player(containerId, {
        videoId: previewVideoId,
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => { if (!destroyed) setPlayerReady(true); },
          onStateChange: (e: any) => {
            if (destroyed) return;
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.();
                if (t != null) setCurrentTime(t);
              }, 100);
            } else {
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) create();
    else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); create(); };
    }
    return () => { destroyed = true; clearInterval(intervalRef.current); };
  }, [previewVideoId]);

  const playAt = useCallback((videoId: string, startTime: number) => {
    if (previewVideoId !== videoId) {
      setPreviewVideoId(videoId);
      setTimeout(() => {
        playerRef.current?.seekTo?.(startTime, true);
        playerRef.current?.playVideo?.();
      }, 1500);
    } else {
      playerRef.current?.seekTo?.(startTime, true);
      playerRef.current?.playVideo?.();
    }
  }, [previewVideoId]);

  // ── Search ──────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchResults(data);
    setSearching(false);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQuery), 300);
  }, [searchQuery, doSearch]);

  // ── CRUD ────────────────────────────────────────────────────

  const addSentence = async (lineId: number) => {
    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_id: lineId, sort_order: sentences.length }),
    });
    if (res.ok) {
      // Re-fetch to get joined data
      const lessonRes = await fetch(`/api/lessons/${lesson.id}`);
      const data = await lessonRes.json();
      setSentences(data.sentences);
    }
  };

  const removeSentence = async (sentenceId: number) => {
    await fetch(`/api/lessons/${lesson.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence_id: sentenceId }),
    });
    setSentences(prev => prev.filter(s => s.id !== sentenceId));
  };

  const getAnnotations = (s: LessonSentence): GrammarAnnotation[] => {
    try { return s.grammar_annotations ? JSON.parse(s.grammar_annotations) : []; } catch { return []; }
  };

  const getTranslations = (s: LessonSentence): Translation[] => {
    try { return s.translations ? JSON.parse(s.translations) : []; } catch { return []; }
  };

  const toggleWordRole = async (sentence: LessonSentence, wordIndex: number) => {
    const annots = getAnnotations(sentence);
    const existing = annots.findIndex(a => a.word_index === wordIndex);
    let newAnnots: GrammarAnnotation[];
    if (existing >= 0 && annots[existing].role === currentRole) {
      newAnnots = annots.filter((_, i) => i !== existing);
    } else if (existing >= 0) {
      newAnnots = annots.map((a, i) => i === existing ? { ...a, role: currentRole } : a);
    } else {
      newAnnots = [...annots, { word_index: wordIndex, role: currentRole }];
    }

    const translations = getTranslations(sentence);

    await fetch(`/api/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence_id: sentence.id, grammar_annotations: newAnnots, translations }),
    });

    setSentences(prev => prev.map(s => s.id === sentence.id ? { ...s, grammar_annotations: JSON.stringify(newAnnots) } : s));
  };

  const updateTranslation = async (sentence: LessonSentence, word: string, tr: string) => {
    const translations = getTranslations(sentence);
    const existing = translations.findIndex(t => t.word.toLowerCase() === word.toLowerCase());
    let newTranslations: Translation[];
    if (existing >= 0) {
      newTranslations = translations.map((t, i) => i === existing ? { ...t, tr } : t);
    } else {
      newTranslations = [...translations, { word, tr }];
    }

    const annots = getAnnotations(sentence);

    await fetch(`/api/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence_id: sentence.id, grammar_annotations: annots, translations: newTranslations }),
    });

    setSentences(prev => prev.map(s => s.id === sentence.id ? { ...s, translations: JSON.stringify(newTranslations) } : s));
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`badge badge-${lesson.level}`}>{lesson.level}</span>
          {lesson.grammar_focus && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">{lesson.grammar_focus}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{lesson.title}</h1>
        {lesson.title_tr && <p className="text-sm text-zinc-500">{lesson.title_tr}</p>}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Left: Sentences + Annotations (3 cols) */}
        <div className="col-span-3 space-y-4">

          {/* Role selector */}
          <div className="flex items-center gap-2 bg-[#111113] rounded-lg border border-zinc-800/50 p-3">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-2">Paint Mode</span>
            {(Object.entries(ROLE_COLORS) as [GrammarRole, typeof ROLE_COLORS.subject][]).map(([role, cfg]) => (
              <button key={role} onClick={() => setCurrentRole(role)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                  currentRole === role
                    ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
                }`}>
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Sentences */}
          {sentences.length === 0 ? (
            <div className="bg-[#111113] rounded-xl border border-zinc-800/50 p-12 text-center">
              <div className="text-2xl mb-2 opacity-30">📝</div>
              <p className="text-sm text-zinc-500">No sentences yet. Search and add from the right panel.</p>
            </div>
          ) : sentences.map((sentence, idx) => {
            const annots = getAnnotations(sentence);
            const translations = getTranslations(sentence);
            const words = sentence.text?.split(' ') || [];
            const isEditing = editingSentenceId === sentence.id;

            return (
              <div key={sentence.id} className={`bg-[#111113] rounded-xl border transition-all ${isEditing ? 'border-violet-500/40' : 'border-zinc-800/50'}`}>
                {/* Sentence header */}
                <div className="px-5 py-3 border-b border-zinc-800/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-zinc-700 w-5">{idx + 1}</span>
                    <span className="text-[10px] text-zinc-600">{sentence.movie_title}</span>
                    <span className="text-[10px] font-mono text-zinc-700">{fmtTime(sentence.start_time || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => sentence.youtube_video_id && playAt(sentence.youtube_video_id, sentence.start_time || 0)}
                      className="text-[10px] text-zinc-600 hover:text-violet-400 px-2 py-1 rounded hover:bg-violet-500/10 transition-colors">
                      ▶ Play
                    </button>
                    <button onClick={() => setEditingSentenceId(isEditing ? null : sentence.id)}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${isEditing ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-600 hover:text-zinc-300'}`}>
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                    <button onClick={() => removeSentence(sentence.id)}
                      className="text-[10px] text-zinc-700 hover:text-red-400 px-1 py-1 rounded hover:bg-red-500/10 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Colored words */}
                <div className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {words.map((word, wi) => {
                      const annot = annots.find(a => a.word_index === wi);
                      const role = annot?.role;
                      const cfg = role ? ROLE_COLORS[role] : null;

                      return (
                        <button key={wi}
                          onClick={() => isEditing && toggleWordRole(sentence, wi)}
                          className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                            cfg
                              ? `${cfg.bg} ${cfg.text} border ${cfg.border}`
                              : isEditing
                                ? 'text-zinc-500 hover:text-white bg-zinc-800/30 hover:bg-zinc-800 border border-zinc-800/50'
                                : 'text-zinc-400 border border-transparent'
                          } ${isEditing ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}>
                          {word}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend for this sentence */}
                  {annots.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-zinc-800/30">
                      {(Object.entries(ROLE_COLORS) as [GrammarRole, typeof ROLE_COLORS.subject][]).map(([role, cfg]) => {
                        const roleWords = annots.filter(a => a.role === role).map(a => words[a.word_index]).filter(Boolean);
                        if (roleWords.length === 0) return null;
                        return (
                          <div key={role} className="flex items-center gap-1.5">
                            <div className={`w-2.5 h-2.5 rounded-sm ${cfg.bg} border ${cfg.border}`} />
                            <span className={`text-[10px] font-medium ${cfg.text}`}>{roleWords.join(' ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Translation editor (expanded when editing) */}
                {isEditing && (
                  <div className="px-5 py-3 border-t border-zinc-800/30 bg-zinc-900/30">
                    <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">Turkish Translations</div>
                    <div className="grid grid-cols-3 gap-2">
                      {words.map((word, wi) => {
                        const existing = translations.find(t => t.word.toLowerCase() === word.toLowerCase());
                        return (
                          <div key={wi} className="flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-500 w-20 truncate">{word}</span>
                            <input
                              defaultValue={existing?.tr || ''}
                              placeholder="..."
                              onBlur={e => { if (e.target.value.trim()) updateTranslation(sentence, word, e.target.value.trim()); }}
                              className="flex-1 px-2 py-1 bg-transparent border border-zinc-800 rounded text-[11px] text-zinc-400 focus:text-white focus:border-violet-500 outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Video preview + Search (2 cols) */}
        <div className="col-span-2 space-y-4">

          {/* Video preview */}
          <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
            <div className="aspect-video bg-black">
              {previewVideoId ? (
                <div id="lesson-yt-player" className="w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
                  Click ▶ Play on a sentence
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/30">
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">Search Sentences</h3>
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search for words or phrases..."
                  className="w-full px-3 py-2 pl-8 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                />
                <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 16 16">
                  <circle cx="6.5" cy="6.5" r="5" /><line x1="10" y1="10" x2="15" y2="15" />
                </svg>
                {searching && <div className="absolute right-3 top-3 w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
              </div>
            </div>

            <div className="max-h-[500px] overflow-auto">
              {searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
                <div className="p-8 text-center text-xs text-zinc-600">No results found</div>
              )}
              {searchResults.map(result => {
                const alreadyAdded = sentences.some(s => s.line_id === result.id);
                return (
                  <div key={result.id}
                    className={`px-4 py-3 border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors ${alreadyAdded ? 'opacity-40' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-zinc-600">{result.movie_title}</span>
                      <span className="text-[10px] font-mono text-zinc-700">{fmtTime(result.start_time)}</span>
                    </div>
                    <p className="text-[13px] text-zinc-300 mb-2 leading-relaxed">{result.text}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => playAt(result.youtube_video_id, result.start_time)}
                        className="text-[10px] text-zinc-600 hover:text-violet-400 px-2 py-1 rounded hover:bg-violet-500/10 transition-colors">
                        ▶ Preview
                      </button>
                      {!alreadyAdded && (
                        <button
                          onClick={() => addSentence(result.id)}
                          className="text-[10px] font-medium text-violet-400 hover:text-white px-2 py-1 rounded bg-violet-500/10 hover:bg-violet-600 transition-all">
                          + Add
                        </button>
                      )}
                      {alreadyAdded && <span className="text-[10px] text-zinc-600">Added</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
