import Link from 'next/link';
import { getCurriculumLesson, getCurriculumUnit, getClipsByStructure, getAllVideos } from '@/lib/db';
import { notFound } from 'next/navigation';
import ClipLinker, { RemoveClipButton } from '@/components/ClipLinker';

export const dynamic = 'force-dynamic';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default async function CurriculumLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = getCurriculumLesson(lessonId);
  if (!lesson) notFound();

  const unit = getCurriculumUnit(lesson.unit_id);
  const linkedClips = getClipsByStructure(lessonId);
  const videos = getAllVideos();

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <Link href="/curriculum" className="text-zinc-600 hover:text-zinc-400 transition-colors">
          Curriculum
        </Link>
        <span className="text-zinc-800">/</span>
        {unit && (
          <>
            <span className="text-zinc-500">{unit.title}</span>
            <span className="text-zinc-800">/</span>
          </>
        )}
        <span className="text-zinc-300">{lesson.title}</span>
      </div>

      {/* Lesson info card */}
      <div className="bg-[#111113] rounded-xl border border-zinc-800/50 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              lesson.status === 'published'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : lesson.status === 'ready'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
            }`}>
              {lesson.status}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
              {lesson.lesson_type}
            </span>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight mb-1">{lesson.title}</h1>
        {lesson.title_tr && (
          <p className="text-sm text-zinc-500 mb-2">{lesson.title_tr}</p>
        )}
        {lesson.grammar_pattern && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Pattern</span>
            <code className="text-[12px] px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700 font-mono">
              {lesson.grammar_pattern}
            </code>
          </div>
        )}
        {lesson.description && (
          <p className="text-[13px] text-zinc-500 mt-3">{lesson.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Linked clips */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">
            Linked Clips
            <span className="ml-2 text-zinc-600 font-normal">({linkedClips.length})</span>
          </h2>

          {linkedClips.length === 0 ? (
            <div className="bg-[#111113] rounded-xl border border-zinc-800/50 p-12 text-center">
              <p className="text-sm text-zinc-500">No clips linked yet</p>
              <p className="text-xs text-zinc-600 mt-1">Use the panel on the right to browse and link clips</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedClips.map(clip => (
                <div key={clip.id} className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {fmtTime(clip.start_time)} - {fmtTime(clip.end_time)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] text-zinc-300 font-medium truncate">{clip.movie_title}</p>
                        <span className="text-[10px] text-zinc-600">
                          {clip.lines.length} line{clip.lines.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <RemoveClipButton lessonId={lessonId} clipId={clip.id} />
                  </div>

                  {/* Show subtitle lines */}
                  {clip.lines.length > 0 && (
                    <div className="px-4 pb-3 space-y-0.5">
                      {clip.lines.map(line => (
                        <p key={line.id} className="text-[11px] text-zinc-500 leading-relaxed">
                          <span className="text-zinc-700">{line.speaker}:</span> {line.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Add clips */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Browse & Add Clips</h2>
          <ClipLinker
            lessonId={lessonId}
            videos={videos}
            linkedClipIds={linkedClips.map(c => c.id)}
          />
        </div>
      </div>
    </div>
  );
}
