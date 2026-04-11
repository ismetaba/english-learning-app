'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PipelineStatus {
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
  find_videos: 'Finding Videos',
  extract_subtitles: 'Extracting Subtitles',
  quality_check: 'Quality Check',
  assign_lessons: 'Assigning to Lessons',
  done: 'Complete',
  error: 'Error',
};

export default function PipelineButton() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [uiState, setUiState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [starting, setStarting] = useState(false);
  const [videoCount, setVideoCount] = useState(50);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const logEndRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/status');
      const data: PipelineStatus = await res.json();
      setStatus(data);

      if (data.stage === 'done') {
        setUiState('done');
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (data.stage === 'error') {
        setUiState('error');
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (data.running) {
        setUiState('running');
      }
    } catch { /* ignore */ }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(poll, 3000);
    poll();
  }, [poll]);

  // Check if already running on mount
  useEffect(() => {
    poll().then(() => {});
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  useEffect(() => {
    if (status?.running && uiState === 'idle') {
      setUiState('running');
      startPolling();
    }
    // Only auto-show if actively running — don't show stale done/error results
  }, [status, uiState, startPolling]);

  useEffect(() => {
    // Scroll log container only, not the whole page
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [status?.log?.length]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: videoCount }) });
      const data = await res.json();
      if (data.started) {
        setUiState('running');
        startPolling();
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`Failed to start: ${err.message}`);
    }
    setStarting(false);
  };

  const handleReset = async () => {
    setUiState('idle');
    setStatus(null);
    // Clear progress file so it doesn't reappear on reload
    try { await fetch('/api/pipeline/status', { method: 'DELETE' }); } catch {}
  };

  const stageIndex = status ? STAGES.indexOf(status.stage) : -1;
  const elapsed = status?.started_at
    ? Math.floor((new Date(status.completed_at || new Date().toISOString()).getTime() - new Date(status.started_at).getTime()) / 1000)
    : 0;
  const elapsedStr = elapsed > 0 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : '';

  // Idle state — compact bar
  if (uiState === 'idle') {
    return (
      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-violet-400">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <div>
            <span className="text-sm font-medium text-zinc-300">Video Pipeline</span>
            <span className="text-[11px] text-zinc-600 ml-2">Find, subtitle, classify, and assign clips</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-zinc-600">Videos:</label>
          <input
            type="number"
            value={videoCount}
            onChange={e => setVideoCount(Math.max(1, Math.min(500, Number(e.target.value) || 50)))}
            className="w-16 px-2 py-1.5 text-[13px] text-center rounded-md bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 focus:outline-none focus:border-violet-500/50"
            min={1}
            max={500}
          />
          <button
            onClick={handleStart}
            disabled={starting}
            className="px-4 py-1.5 text-[13px] font-medium rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-all"
          >
            {starting ? 'Starting...' : 'Run'}
          </button>
        </div>
      </div>
    );
  }

  // Running / Done / Error — fixed bottom panel
  return (
    <div className="fixed bottom-0 right-0 left-[220px] z-50 bg-[#111113] border-t border-zinc-800/50 p-4 shadow-2xl shadow-black/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200">Video Pipeline</h3>
        <div className="flex items-center gap-2">
          {elapsedStr && <span className="text-[10px] text-zinc-600 font-mono">{elapsedStr}</span>}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            uiState === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
            uiState === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {uiState === 'running' ? 'Running' : uiState === 'done' ? 'Complete' : 'Error'}
          </span>
        </div>
      </div>

      {/* Compact layout: stages + counters + log in a row */}
      <div className="flex gap-6 items-start">
        {/* Left: stages + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-2">
            {STAGES.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1 rounded-full transition-colors ${
                  i < stageIndex || status?.stage === 'done' ? 'bg-emerald-500' :
                  i === stageIndex ? 'bg-violet-500 animate-pulse' :
                  'bg-zinc-800'
                }`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[8px] text-zinc-600 mb-2">
            {STAGES.map(s => <span key={s}>{STAGE_LABELS[s]?.split(' ')[0]}</span>)}
          </div>
          <p className="text-[11px] text-zinc-400 truncate">{status?.progress || '...'}</p>
        </div>

        {/* Middle: counters */}
        {status?.results && (
          <div className="flex gap-4 shrink-0">
            {[
              { label: 'Found', value: status.results.videos_found, color: 'text-violet-400' },
              { label: 'Subs', value: status.results.subtitles_extracted, color: 'text-blue-400' },
              { label: 'Checked', value: status.results.quality_checked, color: 'text-amber-400' },
              { label: 'Removed', value: status.results.videos_removed, color: 'text-red-400' },
              { label: 'Assigned', value: status.results.clips_assigned, color: 'text-emerald-400' },
            ].map(r => (
              <div key={r.label} className="text-center">
                <div className={`text-base font-bold font-mono ${r.color}`}>{r.value}</div>
                <div className="text-[8px] text-zinc-600">{r.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Right: log */}
        <div className="w-[300px] shrink-0 bg-[#0a0a0c] rounded-md border border-zinc-800/30 p-2 max-h-[80px] overflow-y-auto font-mono text-[9px] text-zinc-600 space-y-0.5">
          {status?.log?.slice(-10).map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Actions */}
      {(uiState === 'done' || uiState === 'error') && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/30">
          <a href={`/videos?since=${encodeURIComponent(status?.started_at || '')}`} className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30 transition-all">
            View New Videos
          </a>
          <a href="/pipeline/clips" className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all">
            View Clips
          </a>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 transition-all ml-auto"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
