import { NextRequest, NextResponse } from 'next/server';
import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { prepareEsWordRows, type KaraokeWordRow } from '@/lib/word-gloss';

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
        `SELECT id, youtube_video_id, title, movie_title, language
         FROM videos
         WHERE id = ? AND poc = 1`,
      )
      .get(id) as
      | { id: string; youtube_video_id: string; title: string; movie_title: string; language: string }
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

    // Prepared once per request and reused for every clip / line (a
    // video has ~15 clips × ~25 lines).
    // The video's own language picks the word-gloss table, so a clip
    // request needs no ?lang= (video ids are unique across languages).
    const stmts = prepareClipStatements(db, video.language);
    const formatted = clips.map(clip => formatClip(clip, video, stmts));

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

function prepareClipStatements(db: Database.Database, language: string) {
  // Per-word Turkish gloss is sourced from `word_translations`, keyed
  // by a lowercase + sentence-punctuation-trimmed surface form (so
  // "I'm" / "I'm." / "i'm" all collapse to the same row). Independent
  // from the starter set's curated TR (vw.translation_tr) so the
  // client can show both — the starter banner uses the curated one,
  // the inline gloss uses this wider but shallower table. Spanish lines
  // gloss from word_translations_es instead (see lib/word-gloss.ts).
  const englishWords = db.prepare(
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
    // Skip lines without word_timestamps — they can't carry structure
    // tags or per-word karaoke / TR gloss, so they'd render as plain
    // off-white text inside an otherwise fully colored line list. That
    // looks like "missing tags" to the learner. Hiding them keeps the
    // visible subtitle stream consistent; the audio still plays.
    //
    // Must stay a correlated EXISTS (one index probe per candidate
    // line). The previous `id IN (SELECT line_id FROM word_timestamps)`
    // made SQLite materialize all ~2.2M line ids from the index on
    // every execution — ~230ms per clip, 4-60s per request in prod.
    lines: db.prepare(
      `SELECT sl.id, sl.speaker, sl.text, sl.translation_tr,
              sl.start_time, sl.end_time, sl.structure
       FROM subtitle_lines sl
       WHERE sl.clip_id = ?
         AND sl.start_time >= ?
         AND sl.end_time   <= ?
         AND sl.text IS NOT NULL
         AND length(trim(sl.text)) > 0
         AND EXISTS (SELECT 1 FROM word_timestamps wt WHERE wt.line_id = sl.id)
       ORDER BY sl.start_time`,
    ),

    words:
      language === 'es'
        ? prepareEsWordRows(db)
        : (lineId: number) => englishWords.all(lineId) as KaraokeWordRow[],
  };
}

function formatClip(
  clip: { id: number; start_time: number; end_time: number },
  video: { youtube_video_id: string; movie_title: string },
  stmts: ReturnType<typeof prepareClipStatements>,
) {
  const lines = stmts.lines.all(
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

  return {
    id: clip.id,
    youtubeVideoId: video.youtube_video_id,
    movieTitle: video.movie_title,
    startTime: clip.start_time,
    endTime: clip.end_time,
    lines: lines.map(line => {
      const words = stmts.words(line.id);
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
