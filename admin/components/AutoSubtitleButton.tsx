'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  videoId: string;
  hasClips: boolean;
}

export default function AutoSubtitleButton({ videoId, hasClips }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleExtract = async () => {
    setLoading('extract');
    setResult(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/auto-subtitle`, { method: 'POST' });
      const data = await res.json();
      setResult(res.ok ? `${data.lines} lines imported` : `Error: ${data.error}`);
      if (res.ok) router.refresh();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    }
    setLoading(null);
  };

  const handleClear = async () => {
    if (!confirm('Clear all subtitles for this video?')) return;
    setLoading('clear');
    setResult(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/auto-subtitle`, { method: 'DELETE' });
      const data = await res.json();
      setResult(res.ok ? 'Subtitles cleared' : `Error: ${data.error}`);
      if (res.ok) router.refresh();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    }
    setLoading(null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleExtract}
        disabled={loading !== null}
        className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
      >
        {loading === 'extract' ? 'Extracting (WhisperX)...' : hasClips ? 'Re-Extract Subtitles' : 'Auto-Extract Subtitles'}
      </button>
      {hasClips && (
        <button
          onClick={handleClear}
          disabled={loading !== null}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 text-zinc-400 border border-zinc-700"
        >
          {loading === 'clear' ? 'Clearing...' : 'Clear Subtitles'}
        </button>
      )}
      {result && (
        <span className={`text-xs ${result.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
          {result}
        </span>
      )}
    </div>
  );
}
