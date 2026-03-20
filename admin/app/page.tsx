import Link from 'next/link';
import { getStats, getAllVideos, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getShowBreakdown() {
  const db = getDb();
  return db.prepare(`
    SELECT movie_title as name, COUNT(*) as count, difficulty,
           (SELECT COUNT(*) FROM clips c WHERE c.video_id = v2.id) as total_clips
    FROM videos v2
    GROUP BY movie_title
    ORDER BY count DESC
  `).all() as { name: string; count: number; difficulty: string; total_clips: number }[];
}

function getRecentActivity() {
  const db = getDb();
  return db.prepare(`
    SELECT v.title, v.movie_title, v.created_at, v.difficulty,
           (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as line_count,
           (SELECT COUNT(*) FROM word_timestamps wt JOIN subtitle_lines sl ON wt.line_id = sl.id JOIN clips c ON sl.clip_id = c.id WHERE c.video_id = v.id) as word_count
    FROM videos v
    ORDER BY v.created_at DESC
    LIMIT 6
  `).all() as { title: string; movie_title: string; created_at: string; difficulty: string; line_count: number; word_count: number }[];
}

function getTotalWords() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM word_timestamps').get() as { c: number };
  return row.c;
}

function getTotalLines() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM subtitle_lines').get() as { c: number };
  return row.c;
}

function getDifficultyBreakdown() {
  const db = getDb();
  return db.prepare('SELECT difficulty, COUNT(*) as count FROM videos GROUP BY difficulty ORDER BY count DESC').all() as { difficulty: string; count: number }[];
}

export default function Dashboard() {
  const stats = getStats();
  const videos = getAllVideos().slice(0, 6);
  const shows = getShowBreakdown();
  const activity = getRecentActivity();
  const totalWords = getTotalWords();
  const totalLines = getTotalLines();
  const difficulties = getDifficultyBreakdown();

  const maxShowCount = Math.max(...shows.map(s => s.count), 1);

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Content library overview</p>
        </div>
        <Link href="/videos" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
          </svg>
          Add Video
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        <MetricCard label="Videos" value={stats.videos} sub={`${shows.length} shows`} color="violet" />
        <MetricCard label="Clips" value={stats.clips} sub="total segments" color="blue" />
        <MetricCard label="Subtitles" value={totalLines} sub="dialogue lines" color="cyan" />
        <MetricCard label="Words" value={totalWords} sub="with timestamps" color="emerald" />
        <MetricCard label="Tags" value={stats.tags} sub="categories" color="amber" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* Shows Breakdown — 2 cols */}
        <div className="col-span-2 bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800/40 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Shows</h2>
              <p className="text-[11px] text-zinc-600 mt-0.5">{shows.length} shows in library</p>
            </div>
            <Link href="/videos" className="text-[11px] text-zinc-600 hover:text-violet-400 transition-colors">View all &#8594;</Link>
          </div>
          <div className="p-5 space-y-3">
            {shows.map(show => (
              <div key={show.name} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">{show.name}</span>
                  <div className="flex items-center gap-3">
                    <span className={`badge badge-${show.difficulty}`}>{show.difficulty}</span>
                    <span className="text-[11px] font-mono text-zinc-500 w-8 text-right">{show.count}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-500"
                    style={{ width: `${(show.count / maxShowCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Difficulty Breakdown — 1 col */}
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800/40">
            <h2 className="text-sm font-semibold text-zinc-200">Difficulty</h2>
            <p className="text-[11px] text-zinc-600 mt-0.5">Distribution by level</p>
          </div>
          <div className="p-5 space-y-3">
            {difficulties.map(d => {
              const pct = Math.round((d.count / stats.videos) * 100);
              const colors: Record<string, string> = {
                beginner: 'from-green-600 to-green-400',
                elementary: 'from-blue-600 to-blue-400',
                intermediate: 'from-yellow-600 to-yellow-400',
                'upper-intermediate': 'from-orange-600 to-orange-400',
                advanced: 'from-red-600 to-red-400',
              };
              return (
                <div key={d.difficulty}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`badge badge-${d.difficulty}`}>{d.difficulty}</span>
                    <span className="text-[11px] font-mono text-zinc-500">{d.count} <span className="text-zinc-700">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${colors[d.difficulty] || 'from-zinc-600 to-zinc-400'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick stats in this card */}
          <div className="px-5 py-4 border-t border-zinc-800/30 space-y-2.5">
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
        <div className="px-5 py-4 border-b border-zinc-800/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Recent Activity</h2>
            <p className="text-[11px] text-zinc-600 mt-0.5">Latest videos added</p>
          </div>
          <Link href="/videos" className="text-[11px] text-zinc-600 hover:text-violet-400 transition-colors">View all &#8594;</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/40">
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Title</th>
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Show</th>
              <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Lines</th>
              <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Words</th>
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Level</th>
              <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-zinc-600 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {activity.map((v, i) => (
              <tr key={i} className={`group hover:bg-zinc-800/20 ${i < activity.length - 1 ? 'border-b border-zinc-800/20' : ''}`}>
                <td className="px-5 py-3">
                  <span className="text-zinc-300 group-hover:text-white font-medium transition-colors text-[13px]">{v.title}</span>
                </td>
                <td className="px-5 py-3 text-zinc-500 text-[13px]">{v.movie_title}</td>
                <td className="px-5 py-3 text-center">
                  <span className="font-mono text-xs text-zinc-500">{v.line_count}</span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="font-mono text-xs text-zinc-500">{v.word_count.toLocaleString()}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`badge badge-${v.difficulty}`}>{v.difficulty}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="text-[11px] text-zinc-700 group-hover:text-violet-400 transition-colors cursor-pointer">Edit &#8594;</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="bg-[#111113] rounded-xl border border-zinc-800/50 p-4 hover:border-zinc-700/50 transition-all group">
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]} shadow-sm`} />
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight leading-none mb-1">{value.toLocaleString()}</div>
      <div className="text-[11px] text-zinc-600">{sub}</div>
    </div>
  );
}
