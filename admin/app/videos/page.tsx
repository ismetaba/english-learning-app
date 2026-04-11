import Link from 'next/link';
import { Suspense } from 'react';
import { getVideosPaginated, getDistinctShows, getDistinctDifficulties } from '@/lib/db';
import AddVideoButton from '@/components/AddVideoButton';
import DeleteButton from '@/components/DeleteButton';
import Pagination from '@/components/Pagination';
import SearchFilter from '@/components/SearchFilter';

export const dynamic = 'force-dynamic';

function ShowFilter({ shows, current }: { shows: { movie_title: string; count: number }[]; current: string }) {
  // Show top 30 shows + the current one if not in top 30
  const top = shows.slice(0, 30);
  const showSet = new Set(top.map(s => s.movie_title));
  if (current && !showSet.has(current)) {
    const found = shows.find(s => s.movie_title === current);
    if (found) top.push(found);
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      <Link
        href="/videos"
        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all ${
          !current
            ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
            : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-300'
        }`}
      >
        All
        <span className="text-zinc-600 font-mono">{shows.reduce((s, v) => s + v.count, 0)}</span>
      </Link>
      {top.map(s => (
        <Link
          key={s.movie_title}
          href={`/videos?show=${encodeURIComponent(s.movie_title)}`}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all ${
            current === s.movie_title
              ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
              : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-300'
          }`}
        >
          {s.movie_title}
          <span className="text-zinc-600 font-mono">{s.count}</span>
        </Link>
      ))}
    </div>
  );
}

function DifficultyFilter({ difficulties, current }: { difficulties: string[]; current: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/videos"
        className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
          !current
            ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
            : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-300'
        }`}
      >
        All Levels
      </Link>
      {difficulties.map(d => (
        <Link
          key={d}
          href={`/videos?difficulty=${d}`}
          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
            current === d
              ? `badge badge-${d}`
              : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-300'
          }`}
        >
          {d}
        </Link>
      ))}
    </div>
  );
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = typeof params.search === 'string' ? params.search : '';
  const show = typeof params.show === 'string' ? params.show : '';
  const difficulty = typeof params.difficulty === 'string' ? params.difficulty : '';
  const since = typeof params.since === 'string' ? params.since : '';
  const pageSize = 50;

  const result = getVideosPaginated({ page, pageSize, search, show, difficulty, since });
  const shows = getDistinctShows();
  const difficulties = getDistinctDifficulties();

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Videos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {result.total} videos
            {since && <> added in latest pipeline run</>}
            {search && <> matching &ldquo;{search}&rdquo;</>}
            {show && <> in {show}</>}
            {difficulty && <> ({difficulty})</>}
          </p>
        </div>
        <AddVideoButton />
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-72">
            <Suspense>
              <SearchFilter defaultValue={search} placeholder="Search videos..." />
            </Suspense>
          </div>
          <DifficultyFilter difficulties={difficulties} current={difficulty} />
        </div>
        <ShowFilter shows={shows} current={show} />
      </div>

      {/* Video Grid */}
      {result.data.length > 0 ? (
        <>
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

            {result.data.map(v => (
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
                <span className="text-center font-mono text-[11px] text-zinc-600">{v.line_count}</span>

                {/* Words */}
                <span className="text-center font-mono text-[11px] text-zinc-600">{v.word_count > 0 ? v.word_count.toLocaleString() : '-'}</span>

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
            ))}
          </div>

          <Suspense>
            <Pagination
              currentPage={result.page}
              totalPages={result.totalPages}
              totalItems={result.total}
              pageSize={result.pageSize}
            />
          </Suspense>
        </>
      ) : (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 rounded-full bg-zinc-800/60 flex items-center justify-center mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-400">
            {search || show || difficulty ? 'No videos match your filters' : 'No videos yet'}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {search || show || difficulty ? 'Try adjusting your search or filters' : 'Add a YouTube video to get started'}
          </p>
        </div>
      )}
    </div>
  );
}
