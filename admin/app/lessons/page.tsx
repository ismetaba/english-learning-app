import Link from 'next/link';
import { getAllLessons } from '@/lib/db';
import CreateLessonButton from '@/components/CreateLessonButton';

export const dynamic = 'force-dynamic';

export default function LessonsPage() {
  const lessons = getAllLessons();

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Lessons</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{lessons.length} lessons created</p>
        </div>
        <CreateLessonButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map(lesson => (
          <Link key={lesson.id} href={`/lessons/${lesson.id}`}
            className="bg-[#111113] rounded-xl border border-zinc-800/50 p-5 hover:border-zinc-700/50 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <span className={`badge badge-${lesson.level}`}>{lesson.level}</span>
              {lesson.grammar_focus && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {lesson.grammar_focus}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white mb-1">{lesson.title}</h3>
            {lesson.title_tr && <p className="text-xs text-zinc-600 mb-2">{lesson.title_tr}</p>}
            {lesson.description && <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{lesson.description}</p>}
            <div className="flex items-center justify-between text-[10px] text-zinc-600">
              <span>{lesson.sentence_count || 0} sentences</span>
              <span className="group-hover:text-violet-400 transition-colors">Edit &#8594;</span>
            </div>
          </Link>
        ))}
      </div>

      {lessons.length === 0 && (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <div className="text-3xl mb-3 opacity-30">📝</div>
          <p className="text-sm font-medium text-zinc-400">No lessons yet</p>
          <p className="text-xs text-zinc-600 mt-1">Create your first grammar lesson</p>
        </div>
      )}
    </div>
  );
}
