import { NextRequest, NextResponse } from 'next/server';
import { getLesson, getLessonSentences, getDb } from '@/lib/db';

// Returns lesson data grouped by video clips with ALL subtitle lines
// Target sentences get grammar annotations + translations, others are plain
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const targetSentences = getLessonSentences(Number(id));
  const db = getDb();

  // Get unique clip_ids from target sentences
  const clipIds = new Set<number>();
  const lineToClip: Record<number, number> = {};

  for (const s of targetSentences) {
    const line = db.prepare('SELECT clip_id FROM subtitle_lines WHERE id = ?').get(s.line_id) as { clip_id: number } | undefined;
    if (line) {
      clipIds.add(line.clip_id);
      lineToClip[s.line_id] = line.clip_id;
    }
  }

  // Build clip data with ALL subtitle lines
  const clips: any[] = [];

  for (const clipId of clipIds) {
    const clipInfo = db.prepare(`
      SELECT c.*, v.youtube_video_id, v.movie_title
      FROM clips c JOIN videos v ON v.id = c.video_id
      WHERE c.id = ?
    `).get(clipId) as any;
    if (!clipInfo) continue;

    // Get ALL subtitle lines for this clip
    const allLines = db.prepare(`
      SELECT sl.* FROM subtitle_lines sl
      WHERE sl.clip_id = ?
      ORDER BY sl.start_time
    `).all(clipId) as any[];

    // Get word timestamps for each line
    for (const line of allLines) {
      const words = db.prepare(
        'SELECT * FROM word_timestamps WHERE line_id = ? ORDER BY word_index'
      ).all(line.id) as any[];
      line.words = words;
    }

    // Mark target sentences and add annotations
    const targetLineIds = new Set(
      targetSentences.filter(s => lineToClip[s.line_id] === clipId).map(s => s.line_id)
    );

    const lines = allLines.map(line => {
      const target = targetSentences.find(s => s.line_id === line.id);
      return {
        id: line.id,
        text: line.text,
        speaker: line.speaker,
        start_time: line.start_time,
        end_time: line.end_time,
        words: line.words,
        is_target: !!target,
        grammar_annotations: target?.grammar_annotations
          ? (typeof target.grammar_annotations === 'string'
            ? JSON.parse(target.grammar_annotations)
            : target.grammar_annotations)
          : null,
        translations: target?.translations
          ? (typeof target.translations === 'string'
            ? JSON.parse(target.translations)
            : target.translations)
          : null,
      };
    });

    // Count target sentences in this clip
    const targetCount = lines.filter(l => l.is_target).length;

    clips.push({
      clip_id: clipId,
      youtube_video_id: clipInfo.youtube_video_id,
      movie_title: clipInfo.movie_title,
      start_time: clipInfo.start_time,
      end_time: clipInfo.end_time,
      target_count: targetCount,
      lines,
    });
  }

  // Sort clips by number of target sentences (most first)
  clips.sort((a, b) => b.target_count - a.target_count);

  return NextResponse.json({
    id: lesson.id,
    title: lesson.title,
    title_tr: lesson.title_tr,
    description: lesson.description,
    level: lesson.level,
    grammar_focus: lesson.grammar_focus,
    total_targets: targetSentences.length,
    clips,
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
