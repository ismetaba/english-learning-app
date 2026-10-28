import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PATTERN_FILTERS } from '@/lib/pattern-filters';
import { prepareWordRows } from '@/lib/word-gloss';

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

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One karaoke-ready sentence card — shape matches the iOS
 *  `VocabContext` so the existing reels card can render it without
 *  any model changes. The endpoint returns `{ items: [...], total }`
 *  to match how the Word Reels feed is decoded on the client. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
) {
  try {
    const { patternId } = await params;
    const filter = PATTERN_FILTERS[patternId];
    if (!filter) {
      return NextResponse.json(
        { error: `Unknown patternId: ${patternId}` },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const lang = filter.lang ?? 'en';
    const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
    const limit = Math.max(10, Math.min(300, Number.isFinite(limitRaw) ? limitRaw : 100));

    const db = getDb();

    // Quality filter: poc + approved + sentence has structure tags +
    // has Turkish translation + reasonable length. The structure check
    // matters because the karaoke colors lean on subject/aux/rest
    // indices; without them the line still plays but the 3-color
    // code goes flat. Same length cap as vocab-feed (drops monologue
    // walls).
    const rows = db
      .prepare(
        `SELECT
           sl.id              AS line_id,
           sl.text,
           sl.start_time      AS line_start,
           sl.end_time        AS line_end,
           sl.translation_tr  AS line_tr,
           sl.structure       AS structure_raw,
           c.id               AS clip_id,
           c.start_time       AS clip_start,
           c.end_time         AS clip_end,
           v.id               AS video_id,
           v.youtube_video_id,
           v.title            AS video_title,
           v.movie_title
         FROM subtitle_lines sl
         JOIN clips c  ON c.id = sl.clip_id
         JOIN videos v ON v.id = c.video_id
         WHERE c.status = 'approved'
           AND v.language = ?
           -- Note: dropped the v.poc=1 restriction once the akış started
           -- starving on the curated subset. clip.status='approved' is
           -- still the per-clip quality gate.
           AND sl.text IS NOT NULL
           AND length(trim(sl.text)) > 0
           AND length(sl.text) <= 120
           AND sl.translation_tr IS NOT NULL
           AND length(trim(sl.translation_tr)) > 0
           AND sl.structure IS NOT NULL
           ${filter.sqlPredicate}`,
      )
      .all(lang) as {
      line_id: number;
      text: string;
      line_start: number;
      line_end: number;
      line_tr: string | null;
      structure_raw: string | null;
      clip_id: number;
      clip_start: number;
      clip_end: number;
      video_id: string;
      youtube_video_id: string;
      video_title: string;
      movie_title: string;
    }[];

    // Dedupe by exact sentence text — same line shared across multiple
    // approved clip variants only contributes once to keep the akış
    // feeling fresh card-to-card.
    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const r of rows) {
      const key = r.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    // Need at least 3 word_timestamps for the karaoke to look right.
    // Using a single bulk query instead of per-line so the route stays
    // O(1) DB calls regardless of corpus size.
    const lineIds = deduped.map(r => r.line_id);
    const wordCountByLine = new Map<number, number>();
    if (lineIds.length > 0) {
      const placeholders = lineIds.map(() => '?').join(',');
      const counts = db
        .prepare(
          `SELECT line_id, COUNT(*) AS c
           FROM word_timestamps
           WHERE line_id IN (${placeholders})
           GROUP BY line_id`,
        )
        .all(...lineIds) as { line_id: number; c: number }[];
      for (const row of counts) {
        wordCountByLine.set(row.line_id, row.c);
      }
    }
    // Spanish is pro-drop, so a perfectly good "Estoy cansado" is only
    // two words; the 3-word floor (tuned for "I am happy") would starve
    // the ser/estar feed. Two words still karaoke cleanly.
    const minWords = lang === 'es' ? 2 : 3;
    const usable = deduped.filter(r => (wordCountByLine.get(r.line_id) ?? 0) >= minWords);

    // Pick a random sample so repeated visits don't always start with
    // the same first card. The cap is small enough (≤300) that fully
    // shuffling and slicing is fine.
    const sampled = shuffle(usable).slice(0, limit);

    // Per-line word fetch — same shape vocab-feed uses so the iOS
    // VocabContext decoder works unchanged.
    // Spanish lines gloss from word_translations_es (lib/word-gloss.ts).
    const wordRowsFor = prepareWordRows(db, lang);

    // Phrase dict — small enough to load once and reuse per line.
    const phraseRows = db
      .prepare(`SELECT phrase, translation_tr FROM phrase_translations`)
      .all() as { phrase: string; translation_tr: string }[];
    const phraseDict = new Map<string, string>(
      phraseRows.map(r => [r.phrase.toLowerCase(), r.translation_tr]),
    );
    const cleanWord = (w: string) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

    interface PhraseSpan {
      startIndex: number;
      endIndex: number;
      translationTr: string;
      joinedText: string;
    }
    function detectPhrases(
      ws: { word: string; word_index: number }[],
    ): PhraseSpan[] {
      const out: PhraseSpan[] = [];
      let i = 0;
      while (i < ws.length - 1) {
        const w1 = cleanWord(ws[i].word);
        const w2 = cleanWord(ws[i + 1].word);
        const tr = phraseDict.get(`${w1} ${w2}`);
        if (tr) {
          out.push({
            startIndex: ws[i].word_index,
            endIndex: ws[i + 1].word_index,
            translationTr: tr,
            joinedText: `${ws[i].word} ${ws[i + 1].word}`,
          });
          i += 2;
        } else {
          i += 1;
        }
      }
      return out;
    }

    const items = sampled.map(r => {
      const wordRows = wordRowsFor(r.line_id);

      return {
        lineId: r.line_id,
        text: r.text,
        translationTr: r.line_tr,
        startTime: r.line_start,
        endTime: r.line_end,
        clipStartTime: r.clip_start,
        clipEndTime: r.clip_end,
        structure: parseStructure(r.structure_raw),
        videoId: r.video_id,
        youtubeVideoId: r.youtube_video_id,
        videoTitle: r.video_title,
        movieTitle: r.movie_title,
        isPoc: true,
        words: wordRows.map(w => ({
          word: w.word,
          startTime: w.start_time,
          endTime: w.end_time,
          wordIndex: w.word_index,
          starterId: w.starter_word_id ?? null,
          starterTr: w.starter_tr ?? null,
          translationTr: w.word_tr ?? null,
        })),
        // The phrase dictionary is English phrasal verbs.
        phrases: lang === 'es' ? [] : detectPhrases(wordRows),
      };
    });

    return NextResponse.json(
      {
        patternId,
        label: filter.label,
        items,
        total: items.length,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('Error building pattern scenes feed:', error);
    return NextResponse.json(
      { error: 'Failed to build pattern scenes feed' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
