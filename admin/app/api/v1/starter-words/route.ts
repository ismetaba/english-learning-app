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
 * Bulk summary endpoint for the Kelime Haznem grid. Given a comma-
 * separated list of starter word ids (the user's learnedWords from
 * AppState), returns the lightweight rendering shape: word, TR, IPA,
 * POS, CEFR, and the number of distinct sentences in the POC corpus
 * the word appears in (`pocContextCount`). The detail screen calls
 * /starter-words/{id}/contexts for the full sentence list.
 */
export function GET(req: NextRequest) {
  try {
    const idsRaw = req.nextUrl.searchParams.get('ids') ?? '';
    const ids = idsRaw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (ids.length === 0) {
      return NextResponse.json([], { headers: CORS_HEADERS });
    }

    const db = getDb();

    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT
           vw.id, vw.word, vw.translation_tr, vw.ipa, vw.part_of_speech, vw.cefr_level,
           (
             SELECT COUNT(DISTINCT sl.text)
             FROM word_timestamps wt
             JOIN subtitle_lines sl ON sl.id = wt.line_id
             JOIN clips c           ON c.id = sl.clip_id
             JOIN videos v          ON v.id = c.video_id
             WHERE wt.starter_word_id = vw.id
               AND c.status = 'approved'
               AND v.poc = 1
               AND sl.text IS NOT NULL
               AND length(trim(sl.text)) > 0
           ) AS poc_context_count
         FROM vocab_words vw
         WHERE vw.id IN (${placeholders})`,
      )
      .all(...ids) as {
      id: string;
      word: string;
      translation_tr: string | null;
      ipa: string | null;
      part_of_speech: string | null;
      cefr_level: string | null;
      poc_context_count: number;
    }[];

    // Preserve the request order so the iOS grid renders in the
    // user-specified order (e.g. recently added at top) instead of
    // SQLite's IN-clause order which is unspecified.
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = ids
      .map(id => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map(r => ({
        id: r.id,
        word: r.word,
        translationTr: r.translation_tr,
        ipa: r.ipa,
        partOfSpeech: r.part_of_speech,
        cefrLevel: r.cefr_level,
        pocContextCount: r.poc_context_count,
      }));

    return NextResponse.json(ordered, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching starter word summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch starter word summaries' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
