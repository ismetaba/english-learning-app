'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface WordData {
  word: string;
  start_time: number;
  end_time: number;
}

interface ClipLine {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
  words: WordData[];
}

interface ClipData {
  clip_id: number;
  video_id: string;
  video_title: string;
  movie_title: string;
  youtube_video_id: string;
  difficulty: string;
  start_time: number;
  end_time: number;
  lines: ClipLine[];
}

interface Props {
  clips: ClipData[];
  lessonId: string;
  lessonTitle: string;
  initialTargetedLines: Record<number, number[]>; // clipId -> lineIds
}

const LESSON_PATTERNS: Record<string, RegExp> = {
  'lesson-01-greetings': /\b(hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|my\s+name\s+is|nice\s+to\s+meet|goodbye|bye|how\s+are\s+you)\b/i,
  'lesson-02-courtesy-phrases': /\b(please|thank\s+you|thanks|sorry|excuse\s+me|you'?re\s+welcome|pardon)\b/i,
  'lesson-03-subject-pronouns': /\b(I\s+am|I'm|you\s+are|you're|he\s+is|he's|she\s+is|she's|we\s+are|we're|they\s+are|they're)\b/i,
  'lesson-04-to-be-noun': /\b(I\s+am\s+a|I'm\s+a|he\s+is\s+a|he's\s+a|she\s+is\s+a|she's\s+a|is\s+a|am\s+a)\b/i,
  'lesson-05-to-be-adjective': /\b(I'm\s+(?!a\b|not\b|gonna\b)|is\s+(?:so\s+|very\s+)?(?:happy|sad|tired|angry|scared|beautiful|smart|good|bad|great|fine|ready|afraid|crazy|dead|alive|safe|sick|nice|cool))/i,
  'lesson-06-to-be-negative': /\b(I'm\s+not|isn't|is\s+not|aren't|are\s+not|it's\s+not|that's\s+not|he's\s+not|she's\s+not)\b/i,
  'lesson-07-to-be-questions': /^(are\s+you|is\s+he|is\s+she|is\s+it|is\s+this|is\s+that|am\s+I)/i,
  'lesson-08-wh-questions-to-be': /^(what\s+is|what's|where\s+is|where's|who\s+is|who's|how\s+is|how's|how\s+are|why\s+is)/i,
  'lesson-09-articles': /\b(a\s+\w+|an\s+\w+|the\s+\w+)\b/i,
  'lesson-10-demonstratives': /\b(this\s+is|that\s+is|that's|these\s+are|those\s+are)\b/i,
  'lesson-11-possessive-adjectives': /\b(my\s+\w+|your\s+\w+|his\s+\w+|her\s+\w+|our\s+\w+|their\s+\w+)\b/i,
  'lesson-12-basic-vocabulary': /\b(red|blue|green|yellow|black|white|mother|father|mom|dad|brother|sister|family|hand|head|eye|face|heart)\b/i,
  'lesson-13-simple-commands': /^(come|go|look|stop|run|wait|listen|sit|stand|open|close|get|take|give|don't)\b/i,
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function autoDetectTargeted(text: string, lessonId: string): boolean {
  const pattern = LESSON_PATTERNS[lessonId];
  return pattern ? pattern.test(text) : false;
}

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: (() => void) | undefined; }
}

export default function ReviewClient({ clips: initialClips, lessonId, lessonTitle, initialTargetedLines }: Props) {
  const [clips, setClips] = useState(initialClips);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [targetedLines, setTargetedLines] = useState<Record<number, Set<number>>>(() => {
    const map: Record<number, Set<number>> = {};
    for (const [clipId, lineIds] of Object.entries(initialTargetedLines)) {
      map[Number(clipId)] = new Set(lineIds);
    }
    return map;
  });

  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const clip = clips[currentIndex];
  const total = clips.length;

  // Is a line targeted? Check DB state first, then auto-detect fallback
  const isLineTargeted = useCallback((clipId: number, lineId: number, text: string): boolean => {
    const clipTargets = targetedLines[clipId];
    if (clipTargets) return clipTargets.has(lineId);
    // No explicit targets set — use auto-detection
    return autoDetectTargeted(text, lessonId);
  }, [targetedLines, lessonId]);

  // Has this clip been explicitly curated?
  const hasExplicitTargets = useCallback((clipId: number): boolean => {
    return targetedLines[clipId] !== undefined;
  }, [targetedLines]);

  const PADDING = 30; // seconds before/after targeted sentences

  // Recalculate clip bounds from targeted lines
  const recalcClipBounds = useCallback((clipData: ClipData, targetLineIds: Set<number>) => {
    if (targetLineIds.size === 0) return; // no targets, don't change bounds

    const targetedSubtitleLines = clipData.lines.filter(l => targetLineIds.has(l.id));
    if (targetedSubtitleLines.length === 0) return;

    const earliestStart = Math.min(...targetedSubtitleLines.map(l => l.start_time));
    const latestEnd = Math.max(...targetedSubtitleLines.map(l => l.end_time));

    const newStart = Math.max(0, earliestStart - PADDING);
    const newEnd = latestEnd + PADDING;

    // Update local state
    setClips(prev => prev.map(c =>
      c.clip_id === clipData.clip_id ? { ...c, start_time: newStart, end_time: newEnd } : c
    ));

    // Persist to DB
    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId: clipData.clip_id, lessonId, action: 'trim', startTime: newStart, endTime: newEnd }),
    });
  }, [lessonId]);

  // Toggle targeted state
  const toggleTargeted = useCallback(async (clipId: number, lineId: number, text: string) => {
    const isCurrentlyTargeted = isLineTargeted(clipId, lineId, text);
    const action = isCurrentlyTargeted ? 'remove-target' : 'add-target';
    const currentClip = clips.find(c => c.clip_id === clipId);

    // If first explicit toggle on this clip, initialize from auto-detect
    if (!hasExplicitTargets(clipId) && currentClip) {
      const autoTargeted = new Set<number>();
      for (const line of currentClip.lines) {
        if (autoDetectTargeted(line.text, lessonId)) {
          autoTargeted.add(line.id);
          fetch('/api/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipId, lessonId, lineId: line.id, action: 'add-target' }),
          });
        }
      }
      if (isCurrentlyTargeted) autoTargeted.delete(lineId);
      else autoTargeted.add(lineId);

      setTargetedLines(prev => ({ ...prev, [clipId]: autoTargeted }));
      fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, lessonId, lineId, action }),
      });
      // Recalculate bounds
      recalcClipBounds(currentClip, autoTargeted);
      return;
    }

    // Normal toggle
    const newSet = new Set(targetedLines[clipId] || []);
    if (action === 'remove-target') newSet.delete(lineId);
    else newSet.add(lineId);
    setTargetedLines(prev => ({ ...prev, [clipId]: newSet }));

    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, lessonId, lineId, action }),
    });

    // Recalculate bounds
    if (currentClip) recalcClipBounds(currentClip, newSet);
  }, [clips, lessonId, isLineTargeted, hasExplicitTargets, targetedLines, recalcClipBounds]);

  // Manual trim (fine-tune on top of auto-calculated bounds)
  const trimClip = useCallback(async (side: 'start' | 'end', delta: number) => {
    if (!clip) return;
    const newStart = side === 'start' ? Math.max(0, clip.start_time + delta) : clip.start_time;
    const newEnd = side === 'end' ? Math.max(newStart + 1, clip.end_time + delta) : clip.end_time;

    setClips(prev => prev.map((c, i) =>
      i === currentIndex ? { ...c, start_time: newStart, end_time: newEnd } : c
    ));

    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId: clip.clip_id, lessonId, action: 'trim', startTime: newStart, endTime: newEnd }),
    });
  }, [clip, currentIndex, lessonId]);

  // YouTube API
  useEffect(() => {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, []);

  useEffect(() => {
    if (!clip) return;
    const initPlayer = () => {
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: clip.youtube_video_id,
        playerVars: {
          rel: 0,
          start: Math.floor(clip.start_time),
          ...(clip.end_time < 9000 ? { end: Math.ceil(clip.end_time) } : {}),
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              if (timerRef.current) clearInterval(timerRef.current);
              timerRef.current = setInterval(() => {
                if (playerRef.current?.getCurrentTime) setCurrentTime(playerRef.current.getCurrentTime());
              }, 100);
            } else {
              setIsPlaying(false);
              if (timerRef.current) clearInterval(timerRef.current);
            }
          },
        },
      });
    };
    if (window.YT?.Player) initPlayer();
    else window.onYouTubeIframeAPIReady = initPlayer;
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [clip?.clip_id, clip?.youtube_video_id, clip?.start_time, clip?.end_time]);

  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime]);

  const handleRemove = useCallback(async () => {
    if (!clip || removing) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/curriculum/${lessonId}/clips`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: clip.clip_id }),
      });
      if (res.ok) {
        setRemoved(prev => [...prev, clip.clip_id]);
        const newClips = clips.filter((_, i) => i !== currentIndex);
        setClips(newClips);
        if (currentIndex >= newClips.length) setCurrentIndex(Math.max(0, newClips.length - 1));
      }
    } catch {}
    setRemoving(false);
  }, [clip, removing, clips, currentIndex, lessonId]);

  const handleNext = () => { if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1); setCurrentTime(0); };
  const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(currentIndex - 1); setCurrentTime(0); };
  const seekTo = (time: number) => { if (playerRef.current?.seekTo) { playerRef.current.seekTo(time, true); setCurrentTime(time); } };

  const deleteLine = useCallback(async (lineId: number) => {
    if (!clip || !confirm('Delete this subtitle line permanently?')) return;
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, action: 'delete-line' }),
    });
    // Remove from local state
    setClips(prev => prev.map((c, i) =>
      i === currentIndex ? { ...c, lines: c.lines.filter(l => l.id !== lineId) } : c
    ));
  }, [clip, currentIndex]);

  if (clips.length === 0) {
    return (
      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
        <p className="text-sm font-medium text-zinc-400">All clips reviewed</p>
        <p className="text-xs text-zinc-600 mt-1">{removed.length} clips removed from {lessonTitle}</p>
      </div>
    );
  }

  const activeLineIndex = clip.lines.findIndex(
    (line, i) => currentTime >= line.start_time && (i === clip.lines.length - 1 || currentTime < clip.lines[i + 1].start_time)
  );

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200">{lessonTitle}</span>
          <span className="text-[11px] text-zinc-600 font-mono">{currentIndex + 1} / {total}</span>
          {removed.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{removed.length} removed</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handlePrev} disabled={currentIndex === 0}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Prev</button>
          <button onClick={handleNext} disabled={currentIndex >= total - 1}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next</button>
        </div>
      </div>
      <div className="h-1 bg-zinc-800/60 rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
      </div>

      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
        <div className="flex gap-0">
          {/* YouTube Player */}
          <div className="w-[560px] shrink-0 bg-black">
            <div id="yt-player" className="w-full aspect-video" />
          </div>

          {/* Subtitles panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800/30">
              <h3 className="text-[14px] font-semibold text-zinc-200">{clip.video_title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[12px] text-zinc-500">{clip.movie_title}</span>
                <span className="text-zinc-700">|</span>
                <span className={`badge badge-${clip.difficulty} text-[9px]`}>{clip.difficulty}</span>
                <span className="text-[10px] text-zinc-600 font-mono">{clip.lines.length} lines</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[9px] text-zinc-600">
                <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" />Targeted (click to toggle)</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-violet-500 mr-1 align-middle" />Playing</span>
                <span><span className="inline-block px-1 rounded bg-yellow-400/20 text-yellow-300 mr-1 align-middle">w</span>Current word</span>
              </div>
            </div>

            {/* Subtitle lines */}
            <div ref={containerRef} className="flex-1 overflow-y-auto max-h-[280px] px-2 py-2">
              {clip.lines.map((line, lineIdx) => {
                const isActiveLine = lineIdx === activeLineIndex && isPlaying;
                const targeted = isLineTargeted(clip.clip_id, line.id, line.text);

                return (
                  <div
                    key={lineIdx}
                    ref={isActiveLine ? activeLineRef : undefined}
                    className={`flex gap-1.5 py-1.5 px-2 rounded-lg transition-all duration-150 mb-0.5 group ${
                      isActiveLine
                        ? 'bg-violet-500/10 border border-violet-500/25'
                        : targeted
                          ? 'bg-emerald-500/8 border border-emerald-500/15'
                          : 'border border-transparent hover:bg-zinc-800/30'
                    }`}
                  >
                    {/* Target toggle button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleTargeted(clip.clip_id, line.id, line.text); }}
                      className={`w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                        targeted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-800/50 text-zinc-700 opacity-0 group-hover:opacity-100'
                      }`}
                      title={targeted ? 'Remove from targeted' : 'Add to targeted'}
                    >
                      {targeted ? '✓' : '+'}
                    </button>

                    {/* Time + seek */}
                    <span
                      onClick={() => seekTo(line.start_time)}
                      className={`text-[10px] font-mono w-9 shrink-0 text-right mt-1 cursor-pointer hover:text-violet-400 ${
                        isActiveLine ? 'text-violet-400' : 'text-zinc-700'
                      }`}
                    >
                      {formatTime(line.start_time)}
                    </span>

                    {/* Words */}
                    <div className="flex-1 min-w-0">
                      {line.words && line.words.length > 0 ? (
                        <p className="text-[13px] leading-relaxed flex flex-wrap">
                          {line.words.map((w, wi) => {
                            const isActiveWord = isPlaying && currentTime >= w.start_time && currentTime < w.end_time;
                            const isPast = isPlaying && isActiveLine && currentTime >= w.end_time;
                            return (
                              <span
                                key={wi}
                                onClick={(e) => { e.stopPropagation(); seekTo(w.start_time); }}
                                className={`cursor-pointer rounded px-0.5 transition-all duration-75 ${
                                  isActiveWord
                                    ? 'bg-yellow-400/30 text-yellow-200 font-semibold'
                                    : isPast
                                      ? targeted ? 'text-emerald-300' : 'text-zinc-200'
                                      : isActiveLine
                                        ? 'text-zinc-500'
                                        : targeted ? 'text-emerald-300/70' : 'text-zinc-400'
                                }`}
                              >
                                {w.word}{' '}
                              </span>
                            );
                          })}
                        </p>
                      ) : (
                        <p onClick={() => seekTo(line.start_time)} className={`text-[13px] leading-relaxed cursor-pointer ${
                          isActiveLine ? 'text-white font-medium' : targeted ? 'text-emerald-300' : 'text-zinc-400'
                        }`}>{line.text}</p>
                      )}
                    </div>

                    {/* Delete line button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLine(line.id); }}
                      className="w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center text-zinc-700 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all"
                      title="Delete this subtitle line"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action bar with trim controls */}
        <div className="px-5 py-3 border-t border-zinc-800/30 flex items-center justify-between bg-[#0d0d0f]">
          <div className="flex items-center gap-3">
            <button onClick={handleNext} disabled={currentIndex >= total - 1}
              className="px-5 py-2 text-[13px] font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white transition-all">
              Keep &amp; Next
            </button>

            {/* Trim controls */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[10px] text-zinc-600 mr-1">Trim start:</span>
              <button onClick={() => trimClip('start', -1)} className="px-2 py-1 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">-1s</button>
              <button onClick={() => trimClip('start', 1)} className="px-2 py-1 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">+1s</button>
              <span className="text-[10px] text-zinc-600 font-mono mx-1">{formatTime(clip.start_time)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-600 mr-1">end:</span>
              <button onClick={() => trimClip('end', -1)} className="px-2 py-1 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">-1s</button>
              <button onClick={() => trimClip('end', 1)} className="px-2 py-1 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">+1s</button>
              <span className="text-[10px] text-zinc-600 font-mono mx-1">{clip.end_time < 9000 ? formatTime(clip.end_time) : 'end'}</span>
            </div>
          </div>

          <button onClick={handleRemove} disabled={removing}
            className="px-5 py-2 text-[13px] font-medium rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 disabled:opacity-50 transition-all">
            {removing ? 'Removing...' : 'Remove from Lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
