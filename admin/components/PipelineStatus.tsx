'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PipelineData {
  running: boolean;
  stage: string;
  progress: string;
  started_at: string | null;
  completed_at: string | null;
  results: {
    videos_found: number;
    subtitles_extracted: number;
    quality_checked: number;
    videos_removed: number;
    clips_assigned: number;
    errors: string[];
  };
  log: string[];
}

const STAGES = ['find_videos', 'extract_subtitles', 'quality_check', 'assign_lessons'];
const STAGE_LABELS: Record<string, string> = {
  find_videos: 'Find',
  extract_subtitles: 'Subtitle',
  quality_check: 'Review',
  assign_lessons: 'Assign',
};

export default function PipelineStatus() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [visible, setVisible] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const logEndRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/status');
      const d: PipelineData = await res.json();
      setData(d);
      if (d.running) {
        setVisible(true);
      } else if (d.stage === 'done' || d.stage === 'error') {
        setVisible(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        setVisible(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [data?.log?.length, showLog]);

  const dismiss = async () => {
    setVisible(false);
    setShowLog(false);
    try { await fetch('/api/pipeline/status', { method: 'DELETE' }); } catch {}
  };

  if (!visible || !data || data.stage === 'idle') return null;

  const stageIndex = STAGES.indexOf(data.stage);
  const elapsed = data.started_at
    ? Math.floor((new Date(data.completed_at || new Date().toISOString()).getTime() - new Date(data.started_at).getTime()) / 1000)
    : 0;
  const elapsedStr = elapsed > 0 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : '';
  const isDone = data.stage === 'done' || data.stage === 'error';

  return (
    <div className="fixed bottom-0 right-0 left-[220px] z-50">
      {/* Expandable log panel */}
      {showLog && (
        <div className="bg-[#0a0a0c] border-t border-x border-zinc-800/40 rounded-t-lg mx-4 max-h-[250px] overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-zinc-300">Pipeline Log</h4>
            <button onClick={() => setShowLog(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="space-y-1.5">
            {data.log?.map((line, i) => {
              const match = line.match(/^\[([^\]]+)\]\s*(.+)$/);
              const time = match ? match[1].split('T')[1]?.split('.')[0] || match[1] : '';
              const msg = match ? match[2] : line;
              return (
                <div key={i} className="flex gap-3 text-[12px]">
                  {time && <span className="text-zinc-600 font-mono shrink-0 w-16">{time}</span>}
                  <span className="text-zinc-300">{msg}</span>
                </div>
              );
            })}
          </div>
          <div ref={logEndRef} />
        </div>
      )}

      {/* Main bar */}
      <div className="bg-[#0e0e10] border-t border-zinc-700/50 shadow-2xl shadow-black/60 px-6 py-4">
        <div className="flex items-center gap-8">
          {/* Status indicator + label */}
          <div className="flex items-center gap-3 shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${!isDone ? 'bg-amber-400 animate-pulse' : data.stage === 'done' ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-[15px] font-semibold text-zinc-100">Pipeline</span>
            <span className={`text-[12px] px-2.5 py-0.5 rounded-full font-medium ${
              !isDone ? 'bg-amber-500/10 text-amber-400' :
              data.stage === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
              'bg-red-500/10 text-red-400'
            }`}>
              {!isDone ? 'Running' : data.stage === 'done' ? 'Done' : 'Error'}
            </span>
          </div>

          {/* Stage progress with integrated counters */}
          <div className="flex items-center gap-3 w-[400px] shrink-0">
            {(() => {
              const stageData = [
                { stage: STAGES[0], label: STAGE_LABELS[STAGES[0]], value: data.results?.videos_found, color: 'text-violet-400' },
                { stage: STAGES[1], label: STAGE_LABELS[STAGES[1]], value: data.results?.subtitles_extracted, color: 'text-blue-400' },
                { stage: STAGES[2], label: STAGE_LABELS[STAGES[2]], value: data.results?.quality_checked, color: 'text-amber-400' },
                { stage: STAGES[3], label: STAGE_LABELS[STAGES[3]], value: data.results?.clips_assigned, color: 'text-emerald-400' },
              ];
              return stageData.map((sd, i) => {
                const started = i <= stageIndex || data.stage === 'done';
                const active = i === stageIndex;
                const done = i < stageIndex || data.stage === 'done';
                return (
                  <div key={sd.stage} className="flex-1 flex flex-col items-center">
                    <div className={`text-[16px] font-bold font-mono leading-none mb-1.5 ${
                      !started ? 'text-zinc-700' : sd.color
                    }`}>
                      {started ? (sd.value ?? 0) : '–'}
                    </div>
                    <div className={`w-full h-2 rounded-full ${
                      done ? 'bg-emerald-500' :
                      active ? 'bg-violet-500 animate-pulse' :
                      'bg-zinc-800'
                    }`} />
                    <span className="text-[10px] text-zinc-500 mt-1">{sd.label}</span>
                  </div>
                );
              });
            })()}
          </div>

          {/* Removed counter (separate since it's not a stage) */}
          {data.results && data.results.videos_removed > 0 && (
            <div className="text-center shrink-0">
              <div className="text-[16px] font-bold font-mono leading-none text-red-400 mb-1.5">{data.results.videos_removed}</div>
              <div className="text-[10px] text-zinc-500">Removed</div>
            </div>
          )}

          {/* Current action */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-zinc-300 truncate">{data.progress || '...'}</p>
          </div>

          {/* Time */}
          {elapsedStr && <span className="text-[13px] text-zinc-500 font-mono shrink-0">{elapsedStr}</span>}

          {/* Log toggle */}
          <button
            onClick={() => setShowLog(!showLog)}
            className={`p-2 rounded-lg transition-all ${showLog ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
            title="Toggle log"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>

          {/* Actions */}
          {isDone && (
            <>
              <a href={`/videos?since=${encodeURIComponent(data.started_at || '')}`} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 transition-all">
                Videos
              </a>
              <a href={`/pipeline/clips?since=${encodeURIComponent(data.started_at || '')}`} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-all">
                Clips
              </a>
              <button onClick={dismiss} className="px-4 py-2 text-[13px] font-medium rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all">
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
