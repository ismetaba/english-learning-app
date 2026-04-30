import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

/**
 * Returns every approved clip for a POC video, with per-line sentence
 * structure (subject / aux+verb / rest indices) and per-word starter
 * mapping (so the clip player can pause when an active starter word is
 * on screen). Companion to `/api/v1/poc-videos`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    const video = db
      .prepare(
        `SELECT id, youtube_video_id, title, movie_title
         FROM videos
         WHERE id = ? AND poc = 1`,
      )
      .get(id) as
      | { id: string; youtube_video_id: string; title: string; movie_title: string }
      | undefined;
    if (!video) {
      return NextResponse.json(
        { error: 'POC video not found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const clips = db
      .prepare(
        `SELECT id, start_time, end_time
         FROM clips
         WHERE video_id = ? AND status = 'approved'
         ORDER BY start_time`,
      )
      .all(id) as { id: number; start_time: number; end_time: number }[];

    const formatted = clips.map(clip => formatClip(clip, video));

    return NextResponse.json(formatted, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching POC video clips:', error);
    return NextResponse.json(
      { error: 'Failed to fetch POC video clips' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

function parseStructure(raw: string | null): Structure | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (
      Array.isArray(obj.subject) &&
      Array.isArray(obj.aux_verb) &&
      Array.isArray(obj.rest)
    ) {
      return obj as Structure;
    }
    return null;
  } catch {
    return null;
  }
}

function formatClip(
  clip: { id: number; start_time: number; end_time: number },
  video: { youtube_video_id: string; movie_title: string },
) {
  const db = getDb();

  // Skip lines without word_timestamps — they can't carry structure
  // tags or per-word karaoke / TR gloss, so they'd render as plain
  // off-white text inside an otherwise fully colored line list. That
  // looks like "missing tags" to the learner. Hiding them keeps the
  // visible subtitle stream consistent; the audio still plays.
  const lines = db
    .prepare(
      `SELECT id, speaker, text, translation_tr, start_time, end_time, structure
       FROM subtitle_lines
       WHERE clip_id = ?
         AND start_time >= ?
         AND end_time   <= ?
         AND text IS NOT NULL
         AND length(trim(text)) > 0
         AND id IN (SELECT line_id FROM word_timestamps)
       ORDER BY start_time`,
    )
    .all(
      clip.id,
      Math.max(0, clip.start_time - 5),
      clip.end_time + 5,
    ) as {
    id: number;
    speaker: string;
    text: string;
    translation_tr: string | null;
    start_time: number;
    end_time: number;
    structure: string | null;
  }[];

  // Per-word Turkish gloss is sourced from `word_translations`, keyed
  // by a lowercase + sentence-punctuation-trimmed surface form (so
  // "I'm" / "I'm." / "i'm" all collapse to the same row). Independent
  // from the starter set's curated TR (vw.translation_tr) so the
  // client can show both — the starter banner uses the curated one,
  // the inline gloss uses this wider but shallower table.
  const wordsStmt = db.prepare(
    `SELECT wt.word, wt.start_time, wt.end_time, wt.word_index,
            wt.starter_word_id,
            vw.translation_tr AS starter_tr,
            wtr.translation_tr AS word_tr
     FROM word_timestamps wt
     LEFT JOIN vocab_words vw ON vw.id = wt.starter_word_id
     LEFT JOIN word_translations wtr
       ON wtr.word_lower = LOWER(TRIM(wt.word, '.,?!;:"'))
     WHERE wt.line_id = ?
     ORDER BY wt.word_index`,
  );

  return {
    id: clip.id,
    youtubeVideoId: video.youtube_video_id,
    movieTitle: video.movie_title,
    startTime: clip.start_time,
    endTime: clip.end_time,
    lines: lines.map(line => {
      const words = wordsStmt.all(line.id) as {
        word: string;
        start_time: number;
        end_time: number;
        word_index: number;
        starter_word_id: string | null;
        starter_tr: string | null;
        word_tr: string | null;
      }[];
      return {
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        translationTr: line.translation_tr ?? null,
        startTime: line.start_time,
        endTime: line.end_time,
        isTarget: false,
        structure: parseStructure(line.structure),
        words: words.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
          wordIndex: w.word_index,
          starterId: w.starter_word_id ?? null,
          starterTr: w.starter_tr ?? null,
          translationTr: w.word_tr ?? null,
        })),
      };
    }),
  };
}
