'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ProcessButton from './ProcessButton';

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
  live?: {
    total_videos: number;
    with_subtitles: number;
    total_assignments: number;
    total_targeted: number;
  };
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
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
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

  // Idle state
  if (uiState === 'idle') {
    return (
      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-violet-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-200">Video Pipeline</h3>
            <p className="text-[13px] text-zinc-500 mt-0.5">Find, subtitle, classify, and assign clips to lessons</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProcessButton />
          <div className="w-px h-8 bg-zinc-800" />
          <div className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2">
            <label className="text-[13px] text-zinc-400">Videos</label>
            <input
              type="number"
              value={videoCount}
              onChange={e => setVideoCount(Math.max(1, Math.min(500, Number(e.target.value) || 50)))}
              className="w-16 px-2 py-1 text-[14px] text-center rounded-md bg-zinc-900 border border-zinc-700/50 text-zinc-200 focus:outline-none focus:border-violet-500/50 font-mono"
              min={1}
              max={500}
            />
          </div>
          <button
            onClick={handleStart}
            disabled={starting}
            className="px-5 py-2.5 text-[14px] font-medium rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white shadow-lg shadow-violet-600/20 transition-all"
          >
            {starting ? 'Starting...' : 'Find + Process'}
          </button>
        </div>
      </div>
    );
  }

  // Running / Done / Error — the global PipelineStatus component handles the bottom bar
  // Just show a status indicator in the dashboard
  return (
    <div className="bg-[#111113] rounded-xl border border-zinc-800/50 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
          <div className={`w-3 h-3 rounded-full ${uiState === 'running' ? 'bg-amber-400 animate-pulse' : uiState === 'done' ? 'bg-emerald-400' : 'bg-red-400'}`} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-zinc-200">Video Pipeline</h3>
          <p className="text-[13px] text-zinc-500 mt-0.5">
            {uiState === 'running' ? 'Pipeline is running — see status bar below' :
             uiState === 'done' ? 'Pipeline complete — see results below' :
             'Pipeline encountered an error'}
          </p>
        </div>
      </div>
      {elapsedStr && <span className="text-[14px] text-zinc-500 font-mono">{elapsedStr}</span>}
    </div>
  );
}
