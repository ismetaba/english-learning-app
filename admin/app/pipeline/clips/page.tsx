import Link from 'next/link';
import { Suspense } from 'react';
import { getDb } from '@/lib/db';
import Pagination from '@/components/Pagination';

export const dynamic = 'force-dynamic';

interface ClipResult {
  clip_id: number;
  video_id: string;
  video_title: string;
  movie_title: string;
  youtube_video_id: string;
  difficulty: string;
  start_time: number;
  end_time: number;
  line_count: number;
  lessons: string;
  subtitle_preview: string;
}

function getAssignedClips(since?: string): ClipResult[] {
  const db = getDb();
  const whereClause = since ? `AND v.created_at >= ?` : '';
  const params = since ? [since] : [];

  return db.prepare(`
    SELECT
      c.id as clip_id,
      v.id as video_id,
      v.title as video_title,
      v.movie_title,
      v.youtube_video_id,
      v.difficulty,
      c.start_time,
      c.end_time,
      (SELECT COUNT(*) FROM subtitle_lines sl WHERE sl.clip_id = c.id AND sl.start_time >= MAX(0, c.start_time - 5) AND sl.end_time <= c.end_time + 5) as line_count,
      (SELECT GROUP_CONCAT(cs.lesson_id, ', ') FROM clip_structures cs WHERE cs.clip_id = c.id) as lessons,
      (SELECT GROUP_CONCAT(sub.text, ' | ') FROM (SELECT text FROM subtitle_lines WHERE clip_id = c.id AND start_time >= MAX(0, c.start_time - 5) AND end_time <= c.end_time + 5 ORDER BY start_time LIMIT 5) sub) as subtitle_preview
    FROM clips c
    JOIN videos v ON v.id = c.video_id
    WHERE EXISTS (SELECT 1 FROM clip_structures cs WHERE cs.clip_id = c.id)
    ${whereClause}
    ORDER BY v.created_at DESC
  `).all(...params) as ClipResult[];
}

function formatLesson(id: string): string {
  const names: Record<string, string> = {
    'lesson-01-greetings': 'Greetings',
    'lesson-02-courtesy-phrases': 'Courtesy Phrases',
    'lesson-03-subject-pronouns': 'Subject Pronouns',
    'lesson-04-to-be-noun': 'To Be + Noun',
    'lesson-05-to-be-adjective': 'To Be + Adjective',
    'lesson-06-to-be-negative': 'To Be + Negative',
    'lesson-07-to-be-questions': 'To Be + Questions',
    'lesson-08-wh-questions-to-be': 'Wh- Questions',
    'lesson-09-articles': 'Articles',
    'lesson-10-demonstratives': 'Demonstratives',
    'lesson-11-possessive-adjectives': 'Possessive Adj.',
    'lesson-12-basic-vocabulary': 'Basic Vocabulary',
    'lesson-13-simple-commands': 'Simple Commands',
  };
  return names[id] || id;
}

export default async function PipelineClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const since = typeof params.since === 'string' ? params.since : undefined;
  const lessonFilter = typeof params.lesson === 'string' ? params.lesson : undefined;
  const page = Number(params.page) || 1;
  const pageSize = 10;

  let allClips = getAssignedClips(since);
  if (lessonFilter) {
    allClips = allClips.filter(c => c.lessons?.includes(lessonFilter));
  }
  const totalPages = Math.ceil(allClips.length / pageSize);
  const clips = allClips.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">&larr; Dashboard</Link>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Assigned Clips</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {allClips.length} clips
            {lessonFilter && <> in {formatLesson(lessonFilter)}</>}
            {!lessonFilter && <> assigned to A1 lessons</>}
            {since && ' (from latest pipeline run)'}
          </p>
        </div>
        {since && (
          <Link href="/pipeline/clips" className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 transition-all">
            Show All Clips
          </Link>
        )}
      </div>

      {/* Lesson filter */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-none">
        <Link
          href="/pipeline/clips"
          className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
            !lessonFilter ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700'
          }`}
        >
          All Lessons
        </Link>
        {Object.entries({
          'lesson-01-greetings': 'Greetings',
          'lesson-02-courtesy-phrases': 'Courtesy',
          'lesson-03-subject-pronouns': 'Pronouns',
          'lesson-04-to-be-noun': 'Be+Noun',
          'lesson-05-to-be-adjective': 'Be+Adj',
          'lesson-06-to-be-negative': 'Be+Neg',
          'lesson-07-to-be-questions': 'Be+Q',
          'lesson-08-wh-questions-to-be': 'Wh-Q',
          'lesson-09-articles': 'Articles',
          'lesson-10-demonstratives': 'Demo',
          'lesson-11-possessive-adjectives': 'Possessive',
          'lesson-12-basic-vocabulary': 'Vocab',
          'lesson-13-simple-commands': 'Commands',
        }).map(([id, label]) => (
          <Link
            key={id}
            href={`/pipeline/clips?lesson=${id}`}
            className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
              lessonFilter === id ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:border-zinc-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {clips.length > 0 ? (
        <div className="space-y-4">
          {clips.map(clip => (
            <div key={clip.clip_id} className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
              {/* Lesson badges - top bar */}
              {clip.lessons && (
                <div className="px-5 py-2.5 border-b border-zinc-800/30 flex items-center gap-2 flex-wrap bg-[#0d0d0f]">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">Assigned to:</span>
                  {clip.lessons.split(', ').map(lessonId => (
                    <Link
                      key={lessonId}
                      href={`/curriculum/${lessonId}`}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors font-medium"
                    >
                      {formatLesson(lessonId)}
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex gap-0">
                {/* Video embed - starts at clip time */}
                <div className="w-[420px] shrink-0 bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${clip.youtube_video_id}?rel=0&start=${Math.floor(clip.start_time)}${clip.end_time < 9000 ? `&end=${Math.ceil(clip.end_time)}` : ''}`}
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Info */}
                <div className="flex-1 p-4 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-semibold text-zinc-200 truncate">{clip.video_title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-500">{clip.movie_title}</span>
                        <span className="text-[10px] text-zinc-700">|</span>
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {Math.floor(clip.start_time / 60)}:{String(Math.floor(clip.start_time % 60)).padStart(2, '0')}
                          {' - '}
                          {clip.end_time < 9000
                            ? `${Math.floor(clip.end_time / 60)}:${String(Math.floor(clip.end_time % 60)).padStart(2, '0')}`
                            : 'end'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`badge badge-${clip.difficulty} text-[9px]`}>{clip.difficulty}</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{clip.line_count} lines</span>
                    </div>
                  </div>

                  {/* Subtitle preview */}
                  {clip.subtitle_preview && (
                    <div className="bg-[#0a0a0c] rounded-md border border-zinc-800/30 p-2.5 max-h-[120px] overflow-y-auto">
                      <div className="space-y-0.5">
                        {clip.subtitle_preview.split(' | ').map((line, i) => (
                          <p key={i} className="text-[11px] text-zinc-400 leading-relaxed">
                            <span className="text-zinc-600 font-mono mr-1 text-[10px]">{i + 1}.</span>
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2">
                    <Link
                      href={`/videos/${clip.video_id}`}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 transition-all"
                    >
                      Edit Video
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Suspense>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={allClips.length}
              pageSize={pageSize}
            />
          </Suspense>
        </div>
      ) : (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <p className="text-sm font-medium text-zinc-400">No clips assigned yet</p>
          <p className="text-xs text-zinc-600 mt-1">Run the pipeline from the dashboard to find and assign clips</p>
        </div>
      )}
    </div>
  );
}
