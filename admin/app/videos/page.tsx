import Link from 'next/link';
import { getAllVideos } from '@/lib/db';
import AddVideoButton from '@/components/AddVideoButton';
import DeleteButton from '@/components/DeleteButton';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

function getDb() {
  const db = new Database(path.join(process.cwd(), 'data.db'));
  db.pragma('journal_mode = WAL');
  return db;
}

function getVideoStats() {
  const db = getDb();
  return db.prepare(`
    SELECT v.id,
           (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as line_count,
           (SELECT COUNT(*) FROM word_timestamps wt JOIN subtitle_lines sl ON wt.line_id = sl.id JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as word_count
    FROM videos v
  `).all() as { id: string; line_count: number; word_count: number }[];
}

export default function VideosPage() {
  const videos = getAllVideos();
  const videoStats = getVideoStats();
  const statsMap = Object.fromEntries(videoStats.map(s => [s.id, s]));

  // Group by show
  const shows = videos.reduce<Record<string, typeof videos>>((acc, v) => {
    (acc[v.movie_title] = acc[v.movie_title] || []).push(v);
    return acc;
  }, {});
  const showNames = Object.keys(shows).sort();

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Videos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{videos.length} videos across {showNames.length} shows</p>
        </div>
        <AddVideoButton />
      </div>

      {/* Show filter chips */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1 shrink-0">Filter</span>
        {showNames.map(name => (
          <span key={name} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-300 cursor-pointer transition-all">
            {name}
            <span className="text-zinc-600 font-mono">{shows[name].length}</span>
          </span>
        ))}
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 gap-px bg-zinc-800/30 rounded-xl overflow-hidden border border-zinc-800/50">
        {/* Header */}
        <div className="grid grid-cols-[64px_1fr_140px_80px_80px_100px_100px] gap-4 items-center px-5 py-2.5 bg-[#0c0c0e]">
          <span></span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Title</span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Show</span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider text-center">Lines</span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider text-center">Words</span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Level</span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider text-right">Actions</span>
        </div>

        {videos.map(v => {
          const s = statsMap[v.id] || { line_count: 0, word_count: 0 };
          return (
            <div key={v.id} className="grid grid-cols-[64px_1fr_140px_80px_80px_100px_100px] gap-4 items-center px-5 py-2 bg-[#111113] hover:bg-[#151517] transition-colors group">
              {/* Thumbnail */}
              <div className="w-14 h-9 rounded-md overflow-hidden bg-zinc-800 relative shrink-0">
                <img
                  src={`https://img.youtube.com/vi/${v.youtube_video_id}/mqdefault.jpg`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><polygon points="3,1 11,6 3,11" /></svg>
                </div>
              </div>

              {/* Title */}
              <div className="min-w-0">
                <Link href={`/videos/${v.id}`} className="text-[13px] font-medium text-zinc-300 hover:text-white transition-colors truncate block">
                  {v.title}
                </Link>
              </div>

              {/* Show */}
              <span className="text-[12px] text-zinc-500 truncate">{v.movie_title}</span>

              {/* Lines */}
              <span className="text-center font-mono text-[11px] text-zinc-600">{s.line_count}</span>

              {/* Words */}
              <span className="text-center font-mono text-[11px] text-zinc-600">{s.word_count > 0 ? s.word_count.toLocaleString() : '-'}</span>

              {/* Difficulty */}
              <span className={`badge badge-${v.difficulty}`}>{v.difficulty}</span>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/videos/${v.id}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-transparent text-zinc-600 hover:bg-violet-600/10 hover:text-violet-400 transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M8.5 1.5l2 2M1.5 8.5l6-6 2 2-6 6H1.5v-2z" />
                  </svg>
                  Edit
                </Link>
                <DeleteButton endpoint="/api/videos" id={v.id} />
              </div>
            </div>
          );
        })}
      </div>

      {videos.length === 0 && (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 rounded-full bg-zinc-800/60 flex items-center justify-center mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-400">No videos yet</p>
          <p className="text-xs text-zinc-600 mt-1">Add a YouTube video to get started</p>
        </div>
      )}
    </div>
  );
}
