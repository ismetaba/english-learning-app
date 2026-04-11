import Link from 'next/link';
import { getStats, getDb } from '@/lib/db';
import PipelineButton from '@/components/PipelineButton';

export const dynamic = 'force-dynamic';

function getTopShows(limit: number = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT movie_title as name, COUNT(*) as count, difficulty
    FROM videos
    WHERE movie_title != ''
    GROUP BY movie_title
    ORDER BY count DESC
    LIMIT ?
  `).all(limit) as { name: string; count: number; difficulty: string }[];
}

function getTotalShows() {
  const db = getDb();
  return (db.prepare('SELECT COUNT(DISTINCT movie_title) as n FROM videos').get() as any).n;
}

function getRecentActivity() {
  const db = getDb();
  return db.prepare(`
    SELECT v.id, v.title, v.movie_title, v.created_at, v.difficulty, v.youtube_video_id,
           (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as line_count,
           (SELECT COUNT(*) FROM word_timestamps wt JOIN subtitle_lines sl ON wt.line_id = sl.id JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as word_count
    FROM videos v
    ORDER BY v.created_at DESC
    LIMIT 5
  `).all() as { id: string; title: string; movie_title: string; created_at: string; difficulty: string; youtube_video_id: string; line_count: number; word_count: number }[];
}

function getTotalWords() {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as c FROM word_timestamps').get() as { c: number }).c;
}

function getTotalLines() {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as c FROM subtitle_lines').get() as { c: number }).c;
}

function getDifficultyBreakdown() {
  const db = getDb();
  return db.prepare('SELECT difficulty, COUNT(*) as count FROM videos GROUP BY difficulty ORDER BY count DESC').all() as { difficulty: string; count: number }[];
}

function getAssignedClipCount() {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as n FROM clip_structures').get() as any).n;
}

export default function Dashboard() {
  const stats = getStats();
  const shows = getTopShows(10);
  const totalShows = getTotalShows();
  const activity = getRecentActivity();
  const totalWords = getTotalWords();
  const totalLines = getTotalLines();
  const difficulties = getDifficultyBreakdown();
  const assignedClips = getAssignedClipCount();

  const maxShowCount = Math.max(...shows.map(s => s.count), 1);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Content library overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/videos" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
            </svg>
            Add Video
          </Link>
        </div>
      </div>

      {/* Pipeline */}
      <div className="mb-6">
        <PipelineButton />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <MetricCard label="Videos" value={stats.videos} sub={`${totalShows} shows`} color="violet" />
        <MetricCard label="Assignments" value={assignedClips} sub="clip-lesson pairs" color="blue" />
        <MetricCard label="Subtitles" value={totalLines} sub="dialogue lines" color="cyan" />
        <MetricCard label="Words" value={totalWords} sub="with timestamps" color="emerald" />
        <MetricCard label="Tags" value={stats.tags} sub="categories" color="amber" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">

        {/* Top Shows */}
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-200">Top Shows</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-mono">{totalShows}</span>
            </div>
            <Link href="/videos" className="text-[11px] text-zinc-600 hover:text-violet-400 transition-colors">View all &#8594;</Link>
          </div>
          <div className="p-4 space-y-2.5">
            {shows.map(show => (
              <div key={show.name} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-zinc-400 group-hover:text-white transition-colors truncate mr-3">{show.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge badge-${show.difficulty} text-[9px]`}>{show.difficulty}</span>
                    <span className="text-[11px] font-mono text-zinc-600 w-6 text-right">{show.count}</span>
                  </div>
                </div>
                <div className="h-1 bg-zinc-800/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                    style={{ width: `${(show.count / maxShowCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Difficulty + Quick Stats */}
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800/40">
            <h2 className="text-sm font-semibold text-zinc-200">Difficulty</h2>
          </div>
          <div className="p-4 space-y-2.5">
            {difficulties.map(d => {
              const pct = Math.round((d.count / stats.videos) * 100);
              const colors: Record<string, string> = {
                beginner: 'from-green-600 to-green-400',
                elementary: 'from-blue-600 to-blue-400',
                intermediate: 'from-yellow-600 to-yellow-400',
                advanced: 'from-red-600 to-red-400',
              };
              return (
                <div key={d.difficulty}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge badge-${d.difficulty} text-[9px]`}>{d.difficulty}</span>
                    <span className="text-[11px] font-mono text-zinc-500">{d.count} <span className="text-zinc-700">({pct}%)</span></span>
                  </div>
                  <div className="h-1 bg-zinc-800/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${colors[d.difficulty] || 'from-zinc-600 to-zinc-400'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-zinc-800/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-600">Avg words/video</span>
              <span className="text-xs font-mono text-zinc-400">{stats.videos > 0 ? Math.round(totalWords / stats.videos) : 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-600">Avg lines/video</span>
              <span className="text-xs font-mono text-zinc-400">{stats.videos > 0 ? Math.round(totalLines / stats.videos) : 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-600">Approved rate</span>
              <span className="text-xs font-mono text-zinc-400">{stats.clips > 0 ? Math.round((stats.approved / stats.clips) * 100) : 0}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800/40 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Activity</h2>
          <Link href="/videos" className="text-[11px] text-zinc-600 hover:text-violet-400 transition-colors">View all &#8594;</Link>
        </div>
        <div className="divide-y divide-zinc-800/30">
          {activity.map(v => (
            <Link key={v.id} href={`/videos/${v.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-800/20 transition-colors group">
              <div className="w-16 h-10 rounded-md overflow-hidden bg-zinc-800 shrink-0">
                <img
                  src={`https://img.youtube.com/vi/${v.youtube_video_id}/mqdefault.jpg`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-zinc-300 group-hover:text-white truncate transition-colors">{v.title}</p>
                <p className="text-[11px] text-zinc-600">{v.movie_title}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] font-mono text-zinc-600">{v.line_count} lines</span>
                <span className={`badge badge-${v.difficulty} text-[9px]`}>{v.difficulty}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  const dotColors: Record<string, string> = {
    violet: 'bg-violet-500 shadow-violet-500/50',
    blue: 'bg-blue-500 shadow-blue-500/50',
    cyan: 'bg-cyan-500 shadow-cyan-500/50',
    emerald: 'bg-emerald-500 shadow-emerald-500/50',
    amber: 'bg-amber-500 shadow-amber-500/50',
  };

  return (
    <div className="bg-[#111113] rounded-xl border border-zinc-800/50 p-4 hover:border-zinc-700/50 transition-all">
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]} shadow-sm`} />
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight leading-none mb-0.5">{value.toLocaleString()}</div>
      <div className="text-[11px] text-zinc-600">{sub}</div>
    </div>
  );
}
