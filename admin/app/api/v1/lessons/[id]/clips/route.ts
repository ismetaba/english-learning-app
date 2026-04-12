import { NextRequest, NextResponse } from 'next/server';
import { getDb, getLinesForClip } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    // Get targeted line IDs for this lesson
    const targetRows = db.prepare(
      'SELECT clip_id, line_id FROM targeted_lines WHERE lesson_id = ?'
    ).all(id) as { clip_id: number; line_id: number }[];
    const targetLineIds = new Set(targetRows.map(r => r.line_id));
    const clipsWithTargets = new Set(targetRows.map(r => r.clip_id));

    // Step 1: Get clip IDs only (lightweight — no lines/words loaded yet)
    const allClipRows = db.prepare(`
      SELECT c.id, c.start_time, c.end_time, v.youtube_video_id, v.movie_title
      FROM clips c
      JOIN videos v ON v.id = c.video_id
      JOIN clip_structures cs ON cs.clip_id = c.id
      WHERE cs.lesson_id = ? AND c.status = 'approved'
      ORDER BY c.id
    `).all(id) as { id: number; start_time: number; end_time: number; youtube_video_id: string; movie_title: string }[];

    // Step 2: Filter to clips that have targeted lines AND subtitle lines
    const lineCountRows = db.prepare(`
      SELECT clip_id, COUNT(*) as cnt FROM subtitle_lines
      WHERE clip_id IN (${allClipRows.map(() => '?').join(',')})
      GROUP BY clip_id
    `).all(...allClipRows.map(c => c.id)) as { clip_id: number; cnt: number }[];
    const clipsWithLines = new Set(lineCountRows.filter(r => r.cnt > 0).map(r => r.clip_id));

    const usable = allClipRows.filter(clip =>
      clipsWithTargets.has(clip.id) && clipsWithLines.has(clip.id)
    );

    // Parse query params
    const all = req.nextUrl.searchParams.get('all') === 'true';
    const pageParam = req.nextUrl.searchParams.get('page');
    const perPage = parseInt(req.nextUrl.searchParams.get('per_page') || '10', 10);
    const excludeParam = req.nextUrl.searchParams.get('exclude') || '';
    const excludeIds = new Set(
      excludeParam.split(',').filter(Boolean).map(Number)
    );

    // Step 3: Select which clips to return (paginate/filter/random)
    let selectedClips: typeof usable;

    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam, 10));
      const filtered = excludeIds.size > 0
        ? usable.filter(c => !excludeIds.has(c.id))
        : usable;
      const total = filtered.length;
      const totalPages = Math.ceil(total / perPage);
      const start = (page - 1) * perPage;
      selectedClips = filtered.slice(start, start + perPage);

      // Step 4: Load lines + words ONLY for the selected clips
      const formatted = selectedClips.map(clip => formatClipWithLines(clip, targetLineIds));

      return NextResponse.json({
        clips: formatted,
        total,
        page,
        perPage,
        totalPages,
      }, { headers: CORS_HEADERS });
    }

    // ?all=true or default random 10
    if (all) {
      selectedClips = usable;
    } else {
      selectedClips = usable.length <= 10
        ? usable
        : usable.sort(() => Math.random() - 0.5).slice(0, 10);
    }

    // Step 4: Load lines + words ONLY for the selected clips
    const formatted = selectedClips.map(clip => formatClipWithLines(clip, targetLineIds));

    return NextResponse.json(formatted, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching clips for lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch clips' }, { status: 500, headers: CORS_HEADERS });
  }
}

/** Load full line/word data for a single clip and format for API response */
function formatClipWithLines(
  clip: { id: number; start_time: number; end_time: number; youtube_video_id: string; movie_title: string },
  targetLineIds: Set<number>,
) {
  const lines = getLinesForClip(clip.id);
  return {
    id: clip.id,
    youtubeVideoId: clip.youtube_video_id,
    movieTitle: clip.movie_title,
    startTime: clip.start_time,
    endTime: clip.end_time,
    lines: lines.map((line: any) => ({
      id: line.id,
      speaker: line.speaker,
      text: line.text,
      translationTr: line.translation_tr || null,
      startTime: line.start_time,
      endTime: line.end_time,
      isTarget: targetLineIds.has(line.id),
      words: line.words?.map((w: any) => ({
        word: w.word,
        startTime: w.start_time,
        endTime: w.end_time,
      })) ?? [],
    })),
  };
}
