'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Video {
  id: string;
  title: string;
  movie_title: string;
  youtube_video_id: string;
  clip_count?: number;
}

interface SubtitleLine {
  id: number;
  line_index: number;
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

interface Clip {
  id: number;
  video_id: string;
  start_time: number;
  end_time: number;
  status: string;
  lines: SubtitleLine[];
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RemoveClipButton({ lessonId, clipId }: { lessonId: string; clipId: number }) {
  return (
    <button
      type="button"
      className="text-[10px] text-zinc-700 hover:text-red-400 px-2 py-1.5 rounded hover:bg-red-500/10 transition-colors"
      onClick={async () => {
        await fetch(`/api/curriculum/${lessonId}/clips`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipId }),
        });
        window.location.reload();
      }}
    >
      Remove
    </button>
  );
}

export default function ClipLinker({
  lessonId,
  videos,
  linkedClipIds,
}: {
  lessonId: string;
  videos: Video[];
  linkedClipIds: number[];
}) {
  const router = useRouter();
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);

  const fetchClips = useCallback(async (videoId: string) => {
    if (!videoId) { setClips([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}/subtitles`);
      const data = await res.json();
      setClips(data);
    } catch {
      setClips([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedVideoId) fetchClips(selectedVideoId);
    else setClips([]);
  }, [selectedVideoId, fetchClips]);

  const linkClip = async (clipId: number) => {
    setLinking(clipId);
    try {
      const res = await fetch(`/api/curriculum/${lessonId}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore
    }
    setLinking(null);
  };

  return (
    <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/30">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Add Clips from Videos</h3>

        {/* Video selector */}
        <select
          value={selectedVideoId}
          onChange={e => setSelectedVideoId(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white outline-none focus:border-violet-500"
        >
          <option value="">Select a video...</option>
          {videos.map(v => (
            <option key={v.id} value={v.id}>
              {v.movie_title} - {v.title} ({v.clip_count || 0} clips)
            </option>
          ))}
        </select>
      </div>

      {/* Clips list */}
      {loading && (
        <div className="p-8 text-center">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-600 mt-2">Loading clips...</p>
        </div>
      )}

      {!loading && selectedVideoId && clips.length === 0 && (
        <div className="p-8 text-center text-xs text-zinc-600">No clips found for this video</div>
      )}

      {!loading && clips.length > 0 && (
        <div className="max-h-[500px] overflow-auto divide-y divide-zinc-800/20">
          {clips.map(clip => {
            const alreadyLinked = linkedClipIds.includes(clip.id);
            return (
              <div
                key={clip.id}
                className={`px-5 py-3 hover:bg-zinc-800/20 transition-colors ${alreadyLinked ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {fmtTime(clip.start_time)} - {fmtTime(clip.end_time)}
                    </span>
                    <span className={`text-[10px] font-medium ${
                      clip.status === 'approved' ? 'text-emerald-400' : 'text-zinc-600'
                    }`}>
                      {clip.status}
                    </span>
                    <span className="text-[10px] text-zinc-700">
                      {clip.lines.length} line{clip.lines.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {alreadyLinked ? (
                    <span className="text-[10px] text-zinc-600">Already linked</span>
                  ) : (
                    <button
                      onClick={() => linkClip(clip.id)}
                      disabled={linking === clip.id}
                      className="text-[11px] font-medium text-violet-400 hover:text-white px-3 py-1.5 rounded-md bg-violet-500/10 hover:bg-violet-600 transition-all disabled:opacity-50"
                    >
                      {linking === clip.id ? 'Linking...' : 'Link to Lesson'}
                    </button>
                  )}
                </div>

                {/* Preview first few lines */}
                {clip.lines.slice(0, 3).map(line => (
                  <p key={line.id} className="text-[12px] text-zinc-400 leading-relaxed truncate">
                    <span className="text-zinc-600">{line.speaker}:</span> {line.text}
                  </p>
                ))}
                {clip.lines.length > 3 && (
                  <p className="text-[10px] text-zinc-700 mt-0.5">+{clip.lines.length - 3} more lines</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
