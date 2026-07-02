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

interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

function parseStructure(raw: string | null): Structure | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.subject) && Array.isArray(obj.aux_verb) && Array.isArray(obj.rest)) {
      return obj as Structure;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns every distinct sentence (across the POC corpus) where the
 * given starter word appears, alongside the video / clip / timestamp
 * it can be re-watched at and the line's structure tags + per-word
 * Turkish gloss. The Kelime Haznem (vocab) screen renders these as
 * "context cards" — Feynman's bet is that 7 distinct contexts beats
 * 70 isolated repetitions, so the UI surfaces the contexts themselves
 * rather than reducing them to a count.
 *
 * Dedupes by line text so the same sentence appearing across multiple
 * approved clip variants only shows once. Picks the longest/oldest
 * matching subtitle_line as the canonical row (most words tagged).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    const word = db
      .prepare(
        `SELECT id, word, translation_tr, ipa, part_of_speech, cefr_level
         FROM vocab_words
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          word: string;
          translation_tr: string | null;
          ipa: string | null;
          part_of_speech: string | null;
          cefr_level: string | null;
        }
      | undefined;
    if (!word) {
      return NextResponse.json(
        { error: 'Starter word not found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Distinct sentence texts containing this starter, ranked by:
    //  - prefer rows with a populated structure (for colored render)
    //  - prefer the lowest line_id (canonical / earliest curation)
    const rows = db
      .prepare(
        `SELECT
           sl.id          AS line_id,
           sl.text,
           sl.start_time  AS line_start,
           sl.end_time    AS line_end,
           sl.structure,
           c.id           AS clip_id,
           c.start_time   AS clip_start,
           c.end_time     AS clip_end,
           v.id           AS video_id,
           v.youtube_video_id,
           v.title        AS video_title,
           v.movie_title,
           v.poc          AS is_poc
         FROM word_timestamps wt
         JOIN subtitle_lines sl ON sl.id = wt.line_id
         JOIN clips c           ON c.id = sl.clip_id
         JOIN videos v          ON v.id = c.video_id
         WHERE wt.starter_word_id = ?
           AND c.status = 'approved'
           AND v.poc = 1
           AND sl.text IS NOT NULL
           AND length(trim(sl.text)) > 0
         ORDER BY (sl.structure IS NULL), sl.id`,
      )
      .all(id) as {
      line_id: number;
      text: string;
      line_start: number;
      line_end: number;
      structure: string | null;
      clip_id: number;
      clip_start: number;
      clip_end: number;
      video_id: string;
      youtube_video_id: string;
      video_title: string;
      movie_title: string;
      is_poc: number;
    }[];

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

    // Dedupe by line text — one canonical context per unique sentence.
    const seen = new Set<string>();
    const contexts: unknown[] = [];
    for (const r of rows) {
      if (seen.has(r.text)) continue;
      seen.add(r.text);

      const wordRows = wordsStmt.all(r.line_id) as {
        word: string;
        start_time: number;
        end_time: number;
        word_index: number;
        starter_word_id: string | null;
        starter_tr: string | null;
        word_tr: string | null;
      }[];

      contexts.push({
        lineId: r.line_id,
        text: r.text,
        startTime: r.line_start,
        endTime: r.line_end,
        clipStartTime: r.clip_start,
        clipEndTime: r.clip_end,
        structure: parseStructure(r.structure),
        videoId: r.video_id,
        youtubeVideoId: r.youtube_video_id,
        videoTitle: r.video_title,
        movieTitle: r.movie_title,
        isPoc: r.is_poc === 1,
        words: wordRows.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
          wordIndex: w.word_index,
          starterId: w.starter_word_id ?? null,
          starterTr: w.starter_tr ?? null,
          translationTr: w.word_tr ?? null,
        })),
      });
    }

    return NextResponse.json(
      {
        id: word.id,
        word: word.word,
        translationTr: word.translation_tr,
        ipa: word.ipa,
        partOfSpeech: word.part_of_speech,
        cefrLevel: word.cefr_level,
        contextCount: contexts.length,
        contexts,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('Error fetching starter word contexts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch starter word contexts' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
