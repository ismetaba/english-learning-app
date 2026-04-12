import { NextRequest, NextResponse } from 'next/server';
import { getClipsByStructure, getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    // Get targeted line IDs for this lesson
    const targetRows = db.prepare(
      'SELECT clip_id, line_id FROM targeted_lines WHERE lesson_id = ?'
    ).all(id) as { clip_id: number; line_id: number }[];
    const targetLineIds = new Set(targetRows.map(r => r.line_id));
    const clipsWithTargets = new Set(targetRows.map(r => r.clip_id));

    const allClips = getClipsByStructure(id);
    const hasTargetedLines = clipsWithTargets.size > 0;

    // Only keep clips that have subtitle lines; if targeted_lines exist, require them too
    const usable = allClips.filter(clip =>
      clip.lines.length > 0 && (!hasTargetedLines || clipsWithTargets.has(clip.id))
    );

    // Randomly select up to 10 clips
    const clips = usable.length <= 10
      ? usable
      : usable.sort(() => Math.random() - 0.5).slice(0, 10);

    const formatted = clips.map(clip => ({
      id: clip.id,
      youtubeVideoId: clip.youtube_video_id,
      movieTitle: clip.movie_title,
      startTime: clip.start_time,
      endTime: clip.end_time,
      lines: clip.lines.map(line => ({
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        startTime: line.start_time,
        endTime: line.end_time,
        isTarget: targetLineIds.has(line.id),
        words: line.words?.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
        })) ?? [],
      })),
    }));
    return NextResponse.json(formatted, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching clips for lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch clips' }, { status: 500, headers: CORS_HEADERS });
  }
}
