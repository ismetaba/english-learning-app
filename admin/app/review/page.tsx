import Link from 'next/link';
import { getDb } from '@/lib/db';
import ReviewClient from './ReviewClient';

export const dynamic = 'force-dynamic';

const LESSONS = [
  { id: 'lesson-01-greetings', title: 'Greetings & Introductions' },
  { id: 'lesson-02-courtesy-phrases', title: 'Common Courtesy Phrases' },
  { id: 'lesson-03-subject-pronouns', title: 'Subject Pronouns' },
  { id: 'lesson-04-to-be-noun', title: 'To Be + Noun' },
  { id: 'lesson-05-to-be-adjective', title: 'To Be + Adjective' },
  { id: 'lesson-06-to-be-negative', title: 'To Be + Negative' },
  { id: 'lesson-07-to-be-questions', title: 'To Be + Questions' },
  { id: 'lesson-08-wh-questions-to-be', title: 'Wh- Questions with To Be' },
  { id: 'lesson-09-articles', title: 'Articles: a, an, the' },
  { id: 'lesson-10-demonstratives', title: 'Demonstratives' },
  { id: 'lesson-11-possessive-adjectives', title: 'Possessive Adjectives' },
  { id: 'lesson-12-basic-vocabulary', title: 'Basic Vocabulary' },
  { id: 'lesson-13-simple-commands', title: 'Simple Commands' },
];

interface WordData {
  word: string;
  start_time: number;
  end_time: number;
}

interface LineData {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
  words: WordData[];
}

interface ClipData {
  clip_id: number;
  video_id: string;
  video_title: string;
  movie_title: string;
  youtube_video_id: string;
  difficulty: string;
  start_time: number;
  end_time: number;
  lines: LineData[];
}

function getClipsForLesson(lessonId: string): ClipData[] {
  const db = getDb();
  const clips = db.prepare(`
    SELECT DISTINCT c.id as clip_id, v.id as video_id, v.title as video_title,
           v.movie_title, v.youtube_video_id, v.difficulty, c.start_time, c.end_time
    FROM clip_structures cs
    JOIN clips c ON c.id = cs.clip_id
    JOIN videos v ON v.id = c.video_id
    WHERE cs.lesson_id = ?
    ORDER BY v.movie_title
  `).all(lessonId) as Omit<ClipData, 'lines'>[];

  return clips.map(clip => {
    const lines = db.prepare(`
      SELECT id, text, start_time, end_time
      FROM subtitle_lines
      WHERE clip_id = ? AND start_time >= ? AND end_time <= ?
      ORDER BY start_time
    `).all(clip.clip_id, Math.max(0, clip.start_time - 5), clip.end_time + 5) as Omit<LineData, 'words'>[];

    const linesWithWords: LineData[] = lines.map(line => {
      const words = db.prepare(`
        SELECT word, start_time, end_time
        FROM word_timestamps
        WHERE line_id = ?
        ORDER BY word_index
      `).all(line.id) as WordData[];
      return { ...line, words };
    });

    return { ...clip, lines: linesWithWords };
  });
}

function getTargetedLines(lessonId: string): Record<number, number[]> {
  const db = getDb();
  const rows = db.prepare('SELECT clip_id, line_id FROM targeted_lines WHERE lesson_id = ?').all(lessonId) as { clip_id: number; line_id: number }[];
  const map: Record<number, number[]> = {};
  for (const r of rows) {
    (map[r.clip_id] = map[r.clip_id] || []).push(r.line_id);
  }
  return map;
}

function getLessonClipCounts(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT lesson_id, COUNT(DISTINCT clip_id) as count
    FROM clip_structures
    GROUP BY lesson_id
  `).all() as { lesson_id: string; count: number }[];
  return Object.fromEntries(rows.map(r => [r.lesson_id, r.count]));
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const lessonId = typeof params.lesson === 'string' ? params.lesson : '';
  const clipCounts = getLessonClipCounts();

  const clips = lessonId ? getClipsForLesson(lessonId) : [];
  const targetedLines = lessonId ? getTargetedLines(lessonId) : {};
  const currentLesson = LESSONS.find(l => l.id === lessonId);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <Link href="/" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">&larr; Dashboard</Link>
        <h1 className="text-xl font-semibold tracking-tight mt-1">Review Clips</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Watch clips and remove ones that don&apos;t fit the lesson</p>
      </div>

      {/* Lesson selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
        {LESSONS.map(lesson => {
          const count = clipCounts[lesson.id] || 0;
          const isActive = lessonId === lesson.id;
          return (
            <Link
              key={lesson.id}
              href={`/review?lesson=${lesson.id}`}
              className={`px-4 py-3 rounded-lg border transition-all text-left ${
                isActive
                  ? 'bg-violet-600/20 border-violet-500/30 text-violet-300'
                  : 'bg-[#111113] border-zinc-800/50 text-zinc-400 hover:border-zinc-700/50 hover:text-zinc-300'
              }`}
            >
              <div className="text-[12px] font-medium truncate">{lesson.title}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{count} clips</div>
            </Link>
          );
        })}
      </div>

      {/* Clip reviewer */}
      {lessonId && currentLesson ? (
        clips.length > 0 ? (
          <ReviewClient
            clips={JSON.parse(JSON.stringify(clips))}
            lessonId={lessonId}
            lessonTitle={currentLesson.title}
            initialTargetedLines={targetedLines}
          />
        ) : (
          <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
            <p className="text-sm font-medium text-zinc-400">No clips assigned to this lesson</p>
          </div>
        )
      ) : (
        <div className="bg-[#111113] rounded-xl border border-zinc-800/50 flex flex-col items-center justify-center py-20">
          <p className="text-sm font-medium text-zinc-400">Select a lesson above to start reviewing</p>
        </div>
      )}
    </div>
  );
}
