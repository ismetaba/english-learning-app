import Link from 'next/link';
import { getAllCurriculumUnits, getLessonsForUnit, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getClipCountsForLessons(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT lesson_id, COUNT(*) as clip_count
    FROM clip_structures
    GROUP BY lesson_id
  `).all() as { lesson_id: string; clip_count: number }[];
  return Object.fromEntries(rows.map(r => [r.lesson_id, r.clip_count]));
}

export default function CurriculumPage() {
  const units = getAllCurriculumUnits();
  const clipCounts = getClipCountsForLessons();

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Curriculum</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {units.length} units, {units.reduce((sum, u) => sum + (u.lesson_count || 0), 0)} lessons
          </p>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <p className="text-sm font-medium text-zinc-400">No curriculum units yet</p>
          <p className="text-xs text-zinc-600 mt-1">Run the seed script to populate curriculum data</p>
        </div>
      ) : (
        <div className="space-y-6">
          {units.map(unit => {
            const lessons = getLessonsForUnit(unit.id);
            return (
              <div key={unit.id} className="bg-[#111113] rounded-xl border border-zinc-800/50 overflow-hidden">
                {/* Unit header */}
                <div className="px-5 py-4 border-b border-zinc-800/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {unit.color && (
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: unit.color }} />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-200">{unit.title}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
                          {unit.cefr_level}
                        </span>
                        {unit.title_tr && (
                          <span className="text-[11px] text-zinc-600">{unit.title_tr}</span>
                        )}
                        <span className="text-[11px] text-zinc-700">{lessons.length} lessons</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lessons table */}
                {lessons.length > 0 && (
                  <div className="divide-y divide-zinc-800/20">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-4 items-center px-5 py-2 bg-[#0c0c0e]">
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Title</span>
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Type</span>
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Status</span>
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider text-center">Clips</span>
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider text-right">Actions</span>
                    </div>

                    {lessons.map(lesson => {
                      const count = clipCounts[lesson.id] || 0;
                      return (
                        <div key={lesson.id} className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-4 items-center px-5 py-2.5 hover:bg-[#151517] transition-colors group">
                          {/* Title */}
                          <div className="min-w-0">
                            <Link href={`/curriculum/${lesson.id}`} className="text-[13px] font-medium text-zinc-300 hover:text-white transition-colors truncate block">
                              {lesson.title}
                            </Link>
                            {lesson.title_tr && (
                              <span className="text-[11px] text-zinc-600 truncate block">{lesson.title_tr}</span>
                            )}
                          </div>

                          {/* Type */}
                          <span className="text-[11px] text-zinc-500">{lesson.lesson_type}</span>

                          {/* Status */}
                          <span className={`text-[11px] font-medium ${
                            lesson.status === 'published' ? 'text-emerald-400' :
                            lesson.status === 'ready' ? 'text-amber-400' :
                            'text-zinc-600'
                          }`}>
                            {lesson.status}
                          </span>

                          {/* Clip count */}
                          <span className="text-center font-mono text-[11px] text-zinc-600">
                            {count > 0 ? count : '-'}
                          </span>

                          {/* Actions */}
                          <div className="flex items-center justify-end">
                            <Link
                              href={`/curriculum/${lesson.id}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-transparent text-zinc-600 hover:bg-violet-600/10 hover:text-violet-400 transition-all"
                            >
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M8.5 1.5l2 2M1.5 8.5l6-6 2 2-6 6H1.5v-2z" />
                              </svg>
                              Edit
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
