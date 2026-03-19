'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────

interface WordTimestamp {
  word: string;
  start_time: number;
  end_time: number;
}

interface SubtitleLine {
  id: number;
  clip_id: number;
  line_index: number;
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
  words?: WordTimestamp[];
}

interface Clip {
  id: number;
  video_id: string;
  start_time: number;
  end_time: number;
  status: string;
  lines: SubtitleLine[];
}

interface Video {
  id: string;
  youtube_video_id: string;
  title: string;
  movie_title: string;
}

interface Props {
  video: Video;
  clips: Clip[];
}

// ── Helpers ────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function fmtShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────────

export default function SubtitleEditor({ video, clips: initialClips }: Props) {
  const [clips, setClips] = useState(initialClips);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [editingWordLine, setEditingWordLine] = useState<number | null>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const lineRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const containerId = `yt-editor-${video.id}`;

  const deleteClipHandler = async (clipId: number) => {
    if (!confirm('Delete this clip and all its subtitle lines?')) return;
    await fetch('/api/clips', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clipId }),
    });
    setClips(prev => prev.filter(c => c.id !== clipId));
  };

  const allLines = clips.flatMap(c => c.lines).sort((a, b) => a.start_time - b.start_time);
  const activeLine = allLines.find(l => currentTime >= l.start_time && currentTime < l.end_time);
  const maxTime = Math.max(...clips.map(c => c.end_time), 60);
  const selectedLine = allLines.find(l => l.id === selectedLineId);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLine && lineRefs.current[activeLine.id]) {
      lineRefs.current[activeLine.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLine?.id]);

  // ── YouTube Player ──────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let destroyed = false;

    const createPlayer = () => {
      if (destroyed || !document.getElementById(containerId)) return;
      playerRef.current = new (window as any).YT.Player(containerId, {
        videoId: video.youtube_video_id,
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, disablekb: 1, iv_load_policy: 3 },
        events: {
          onReady: () => { if (!destroyed) setPlayerReady(true); },
          onStateChange: (e: any) => {
            if (destroyed) return;
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.();
                if (t != null && !destroyed) setCurrentTime(t);
              }, 100);
            } else {
              setIsPlaying(false);
              clearInterval(intervalRef.current);
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); createPlayer(); };
    }

    return () => { destroyed = true; clearInterval(intervalRef.current); try { playerRef.current?.destroy?.(); } catch {} };
  }, [video.youtube_video_id, containerId]);

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seekTo?.(time, true);
    setCurrentTime(time);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) playerRef.current?.pauseVideo?.();
    else playerRef.current?.playVideo?.();
  }, [isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, currentTime - 0.5)); }
      if (e.code === 'ArrowRight') { e.preventDefault(); seekTo(currentTime + 0.5); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, seekTo, currentTime]);

  // ── CRUD ────────────────────────────────────────────────────

  const saveLine = async (line: SubtitleLine) => {
    setSaving(prev => new Set(prev).add(line.id));
    try {
      await fetch(`/api/videos/${video.id}/subtitles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId: line.id, speaker: line.speaker, text: line.text, start_time: line.start_time, end_time: line.end_time, words: line.words }),
      });
      setSaved(prev => new Set(prev).add(line.id));
      setTimeout(() => setSaved(prev => { const n = new Set(prev); n.delete(line.id); return n; }), 1500);
    } catch {}
    setSaving(prev => { const n = new Set(prev); n.delete(line.id); return n; });
  };

  const addLine = async () => {
    const clipId = clips[0]?.id;
    if (!clipId) return;
    const insertTime = currentTime || 0;
    const res = await fetch(`/api/videos/${video.id}/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, speaker: 'Speaker', text: 'New subtitle line', start_time: Math.round(insertTime * 10) / 10, end_time: Math.round((insertTime + 3) * 10) / 10, line_index: allLines.length }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setClips(prev => prev.map(c => c.id === clipId ? { ...c, lines: [...c.lines, { id, clip_id: clipId, line_index: allLines.length, speaker: 'Speaker', text: 'New subtitle line', start_time: Math.round(insertTime * 10) / 10, end_time: Math.round((insertTime + 3) * 10) / 10 }] } : c));
      setSelectedLineId(id);
    }
  };

  const deleteLine = async (lineId: number) => {
    await fetch(`/api/videos/${video.id}/subtitles`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId }),
    });
    setClips(prev => prev.map(c => ({ ...c, lines: c.lines.filter(l => l.id !== lineId) })));
    if (selectedLineId === lineId) setSelectedLineId(null);
    if (editingWordLine === lineId) setEditingWordLine(null);
  };

  const updateLine = (lineId: number, updates: Partial<SubtitleLine>) => {
    setClips(prev => prev.map(clip => ({ ...clip, lines: clip.lines.map(l => l.id === lineId ? { ...l, ...updates } : l) })));
  };

  const updateWordTiming = (lineId: number, wordIdx: number, field: 'start_time' | 'end_time', value: number) => {
    setClips(prev => prev.map(clip => ({
      ...clip,
      lines: clip.lines.map(l => {
        if (l.id !== lineId || !l.words) return l;
        const newWords = [...l.words];
        newWords[wordIdx] = { ...newWords[wordIdx], [field]: value };
        return { ...l, words: newWords };
      }),
    })));
  };

  const pct = (t: number) => (t / maxTime) * 100;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">

      {/* ── Top: Video + Preview ────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4 mb-4 shrink-0">
        {/* Player */}
        <div className="col-span-3">
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-800 relative">
            <div id={containerId} className="w-full h-full" />
            {!playerReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                <div className="animate-pulse text-gray-600 text-sm">Loading player...</div>
              </div>
            )}
          </div>
        </div>

        {/* Live Preview */}
        <div className="col-span-2 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800/60 flex items-center gap-2 bg-gray-900/40">
            <div className={`w-1.5 h-1.5 rounded-full ${activeLine ? 'bg-green-400 shadow-sm shadow-green-400/50' : 'bg-gray-700'}`} />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em]">Preview</span>
            <span className="ml-auto text-[10px] font-mono text-gray-600">{fmtTime(currentTime)}</span>
          </div>
          <div className="flex-1 flex items-center justify-center p-5">
            {activeLine ? (
              <div className="w-full space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/15 text-violet-400 uppercase tracking-wider">{activeLine.speaker}</span>
                  <span className="text-[10px] font-mono text-gray-600">{fmtTime(activeLine.start_time)} → {fmtTime(activeLine.end_time)}</span>
                </div>
                <p className="text-base leading-7 font-medium">
                  {activeLine.text.split(' ').map((word, i) => {
                    const wt = activeLine.words?.[i];
                    const revealed = wt ? currentTime >= wt.start_time : currentTime >= activeLine.start_time;
                    return <span key={i} className={`transition-colors duration-75 ${revealed ? 'text-white' : 'text-gray-800'}`}>{word}{' '}</span>;
                  })}
                </p>
                <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-100 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, ((currentTime - activeLine.start_time) / (activeLine.end_time - activeLine.start_time)) * 100))}%` }} />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-700 text-xs">
                <div className="text-2xl mb-2 opacity-30">🎬</div>
                No subtitle at {fmtTime(currentTime)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Transport Bar ───────────────────────────────────── */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800/50 px-4 py-2.5 flex items-center gap-3 mb-4 shrink-0">
        <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[10px] transition-all hover:scale-105 active:scale-95 shrink-0">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={() => seekTo(Math.max(0, currentTime - 5))} className="text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded hover:bg-gray-800 transition-colors">-5s</button>
        <button onClick={() => seekTo(Math.max(0, currentTime - 1))} className="text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded hover:bg-gray-800 transition-colors">-1s</button>

        <span className="font-mono text-[11px] text-violet-300 w-14 text-center shrink-0">{fmtTime(currentTime)}</span>

        {/* Timeline */}
        <div className="flex-1 h-6 bg-gray-800/60 rounded relative cursor-pointer group" onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo(((e.clientX - rect.left) / rect.width) * maxTime);
        }}>
          {/* Subtitle blocks */}
          {allLines.map(l => {
            const isAct = activeLine?.id === l.id;
            const isSel = selectedLineId === l.id;
            return (
              <div key={l.id}
                className={`absolute top-0.5 bottom-0.5 rounded-sm transition-colors ${isAct ? 'bg-violet-500/50 ring-1 ring-violet-400/50' : isSel ? 'bg-blue-500/30' : 'bg-emerald-500/20 hover:bg-emerald-500/30'}`}
                style={{ left: `${pct(l.start_time)}%`, width: `${Math.max(0.4, pct(l.end_time) - pct(l.start_time))}%` }}
                onClick={(e) => { e.stopPropagation(); setSelectedLineId(l.id); seekTo(l.start_time); }}
              />
            );
          })}
          {/* Playhead */}
          <div className="absolute top-0 bottom-0 w-px bg-white/80 z-10" style={{ left: `${pct(currentTime)}%` }}>
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
          </div>
        </div>

        <button onClick={() => seekTo(currentTime + 1)} className="text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded hover:bg-gray-800 transition-colors">+1s</button>
        <button onClick={() => seekTo(currentTime + 5)} className="text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded hover:bg-gray-800 transition-colors">+5s</button>
        <span className="font-mono text-[10px] text-gray-600 w-10 text-right shrink-0">{fmtShort(maxTime)}</span>

        <div className="w-px h-5 bg-gray-700 mx-1" />
        <div className="text-[9px] text-gray-600 space-x-2">
          <span>SPACE play</span>
          <span>← → seek</span>
        </div>
      </div>

      {/* ── Clips Bar ─────────────────────────────────────── */}
      {clips.length > 0 && (
        <div className="flex items-center gap-2 mb-3 shrink-0 overflow-x-auto pb-1">
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1 shrink-0">Clips</span>
          {clips.map(c => (
            <div key={c.id} className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-[11px] rounded-lg bg-zinc-800/50 border border-zinc-800/50 group/clip">
              <span className="font-mono text-zinc-500">#{c.id}</span>
              <span className="text-zinc-400">{fmtShort(c.start_time)} - {fmtShort(c.end_time)}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${c.status === 'approved' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>{c.status}</span>
              <span className="text-zinc-600 font-mono">{c.lines.length} lines</span>
              <button
                onClick={() => deleteClipHandler(c.id)}
                className="opacity-0 group-hover/clip:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 hover:text-red-400 text-zinc-700 transition-all text-[10px]"
                title="Delete clip"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Subtitle Table + Word Editor ────────────────────── */}
      <div className="flex-1 flex gap-4 min-h-0">

        {/* Lines table */}
        <div className="flex-1 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800/60 flex items-center justify-between bg-gray-900/30 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold">Subtitles</h2>
              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{allLines.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addLine} className="text-[10px] font-medium px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                + Add Line
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-950 z-10 border-b border-gray-800/50">
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left w-20">Start</th>
                  <th className="px-3 py-2 text-left w-20">End</th>
                  <th className="px-3 py-2 text-left w-24">Speaker</th>
                  <th className="px-3 py-2 text-left">Text</th>
                  <th className="px-3 py-2 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allLines.map((line, idx) => {
                  const isAct = activeLine?.id === line.id;
                  const isSel = selectedLineId === line.id;
                  const isSaving = saving.has(line.id);
                  const isSaved = saved.has(line.id);
                  return (
                    <tr
                      key={line.id}
                      ref={el => { lineRefs.current[line.id] = el; }}
                      className={`border-b border-gray-800/30 cursor-pointer transition-all group ${
                        isAct ? 'bg-violet-500/8' : isSel ? 'bg-blue-500/5' : 'hover:bg-gray-800/30'
                      }`}
                      onClick={() => { setSelectedLineId(line.id); seekTo(line.start_time); }}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          {isAct && <div className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />}
                          <span className="text-gray-700 font-mono">{idx + 1}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step="0.1" value={line.start_time}
                          onChange={e => updateLine(line.id, { start_time: parseFloat(e.target.value) || 0 })}
                          onClick={e => e.stopPropagation()}
                          className="w-16 px-1.5 py-1 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 focus:bg-gray-900 rounded text-[11px] font-mono text-gray-400 focus:text-white outline-none transition-all" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step="0.1" value={line.end_time}
                          onChange={e => updateLine(line.id, { end_time: parseFloat(e.target.value) || 0 })}
                          onClick={e => e.stopPropagation()}
                          className="w-16 px-1.5 py-1 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 focus:bg-gray-900 rounded text-[11px] font-mono text-gray-400 focus:text-white outline-none transition-all" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={line.speaker}
                          onChange={e => updateLine(line.id, { speaker: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          className="w-20 px-1.5 py-1 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 focus:bg-gray-900 rounded text-[11px] text-gray-400 focus:text-white outline-none transition-all" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={line.text}
                          onChange={e => updateLine(line.id, { text: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          className="w-full px-1.5 py-1 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 focus:bg-gray-900 rounded text-[11px] text-gray-300 focus:text-white outline-none transition-all" />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditingWordLine(editingWordLine === line.id ? null : line.id); }}
                            className={`p-1 rounded text-[10px] transition-colors ${editingWordLine === line.id ? 'bg-blue-500/20 text-blue-400' : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800'}`}
                            title="Word timing">
                            🔤
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); saveLine(line); }}
                            disabled={isSaving}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${isSaved ? 'bg-green-500/15 text-green-400' : isSaving ? 'text-gray-600' : 'text-gray-500 hover:text-white hover:bg-violet-600'}`}>
                            {isSaved ? '✓' : isSaving ? '...' : 'Save'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteLine(line.id); }}
                            className="p-1 rounded text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-colors text-[10px] opacity-0 group-hover:opacity-100"
                            title="Delete line">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Word Timing Editor (right panel, visible when a line is selected for word editing) */}
        {editingWordLine && (() => {
          const line = allLines.find(l => l.id === editingWordLine);
          if (!line) return null;
          const words = line.words || line.text.split(' ').map((w, i, arr) => {
            const lineDur = line.end_time - line.start_time;
            const perWord = lineDur / arr.length;
            return { word: w, start_time: Math.round((line.start_time + i * perWord) * 10) / 10, end_time: Math.round((line.start_time + (i + 1) * perWord) * 10) / 10 };
          });

          // Initialize words in state if not present
          if (!line.words) {
            updateLine(line.id, { words });
          }

          return (
            <div className="w-80 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden shrink-0">
              <div className="px-4 py-2.5 border-b border-gray-800/60 bg-gray-900/30 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">Word Timing</span>
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{words.length} words</span>
                  </div>
                  <button onClick={() => setEditingWordLine(null)} className="text-gray-600 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors">✕</button>
                </div>
                <div className="text-[10px] text-gray-600 mt-1 truncate">Line #{allLines.indexOf(line) + 1}: {line.text.substring(0, 40)}...</div>
              </div>

              {/* Word timeline visualization */}
              <div className="px-4 py-3 border-b border-gray-800/40 shrink-0">
                <div className="h-6 bg-gray-800/60 rounded relative">
                  {words.map((w, i) => {
                    const leftPct = ((w.start_time - line.start_time) / (line.end_time - line.start_time)) * 100;
                    const widthPct = ((w.end_time - w.start_time) / (line.end_time - line.start_time)) * 100;
                    const isWordActive = currentTime >= w.start_time && currentTime < w.end_time;
                    return (
                      <div key={i}
                        className={`absolute top-0.5 bottom-0.5 rounded-sm text-[7px] flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${
                          isWordActive ? 'bg-violet-500/60 text-white' : 'bg-gray-700/50 text-gray-500 hover:bg-gray-700'
                        }`}
                        style={{ left: `${leftPct}%`, width: `${Math.max(3, widthPct)}%` }}
                        onClick={() => seekTo(w.start_time)}
                        title={`${w.word}: ${fmtTime(w.start_time)} - ${fmtTime(w.end_time)}`}
                      >
                        {widthPct > 8 ? w.word : ''}
                      </div>
                    );
                  })}
                  <div className="absolute top-0 bottom-0 w-px bg-white/60 z-10 pointer-events-none"
                    style={{ left: `${Math.max(0, Math.min(100, ((currentTime - line.start_time) / (line.end_time - line.start_time)) * 100))}%` }} />
                </div>
              </div>

              {/* Word list */}
              <div className="flex-1 overflow-auto">
                {words.map((w, i) => {
                  const isWordActive = currentTime >= w.start_time && currentTime < w.end_time;
                  return (
                    <div key={i}
                      className={`flex items-center gap-2 px-4 py-1.5 border-b border-gray-800/20 cursor-pointer transition-colors ${isWordActive ? 'bg-violet-500/8' : 'hover:bg-gray-800/30'}`}
                      onClick={() => seekTo(w.start_time)}
                    >
                      <span className={`text-xs font-medium w-20 truncate ${isWordActive ? 'text-white' : 'text-gray-400'}`}>{w.word}</span>
                      <input type="number" step="0.05" value={w.start_time}
                        onChange={e => updateWordTiming(line.id, i, 'start_time', parseFloat(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        className="w-14 px-1 py-0.5 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 rounded text-[10px] font-mono text-gray-500 focus:text-white outline-none" />
                      <span className="text-gray-800 text-[10px]">→</span>
                      <input type="number" step="0.05" value={w.end_time}
                        onChange={e => updateWordTiming(line.id, i, 'end_time', parseFloat(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        className="w-14 px-1 py-0.5 bg-transparent border border-transparent hover:border-gray-700 focus:border-violet-500 rounded text-[10px] font-mono text-gray-500 focus:text-white outline-none" />
                      <span className="text-[9px] text-gray-700 font-mono">{((w.end_time - w.start_time) * 1000).toFixed(0)}ms</span>
                    </div>
                  );
                })}
              </div>

              {/* Save word timing */}
              <div className="px-4 py-2.5 border-t border-gray-800/60 shrink-0">
                <button onClick={() => saveLine(line)}
                  className="w-full py-2 text-xs font-medium rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                  Save Word Timing
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
