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

interface RawRow {
  word_id: string;
  word: string;
  translation_tr: string | null;
  ipa: string | null;
  part_of_speech: string | null;
  cefr_level: string | null;
  line_id: number;
  text: string;
  line_start: number;
  line_end: number;
  structure_raw: string | null;
  clip_id: number;
  clip_start: number;
  clip_end: number;
  video_id: string;
  youtube_video_id: string;
  video_title: string;
  movie_title: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Reorders a flat item list so the same word doesn't appear within
 * `cooldown` consecutive cards. Greedy: at each position, picks the
 * best candidate that doesn't violate the cooldown; if no candidate
 * works, picks the one with the largest gap to its last appearance.
 *
 * Keeps the feel of "endless variety" — even when a few hub words
 * dominate the pool, the reel skips between them rather than running
 * three "look" sentences in a row.
 */
function shuffleWithCooldown<T extends { wordId: string }>(
  items: T[],
  cooldown: number,
): T[] {
  const remaining = shuffle(items);
  const out: T[] = [];
  const lastSeenAt = new Map<string, number>();

  while (remaining.length > 0) {
    let pickIdx = -1;
    let bestFallback = -1;
    let bestFallbackGap = -1;

    for (let i = 0; i < remaining.length; i += 1) {
      const w = remaining[i].wordId;
      const last = lastSeenAt.get(w) ?? -Infinity;
      const gap = out.length - last;
      if (gap > cooldown) {
        pickIdx = i;
        break;
      }
      if (gap > bestFallbackGap) {
        bestFallbackGap = gap;
        bestFallback = i;
      }
    }
    if (pickIdx === -1) pickIdx = bestFallback;
    const picked = remaining.splice(pickIdx, 1)[0];
    lastSeenAt.set(picked.wordId, out.length);
    out.push(picked);
  }
  return out;
}

/**
 * The Word Reels feed. Smart-shuffled mix of contexts pulled from the
 * POC corpus, scoped to the user's vocab pool plus a discovery
 * sample. Each item is a self-contained playable card: the starter
 * word + a single sentence (with structure tags + per-word TR) +
 * timestamps to play that sentence inside the YouTube clip.
 *
 * Query params:
 *   ids        — comma-separated starter ids the user has saved.
 *                Words in this set are "pool" words: up to 5
 *                contexts each, weighted higher in the feed.
 *   discovery  — "1" (default) to also include up to 1 context per
 *                NOT-yet-saved A2 starter, so the user keeps
 *                bumping into new words. "0" to limit to pool only.
 *   limit      — max items returned (default 80). The shuffle has
 *                a 4-card cooldown so the same word doesn't appear
 *                in tight succession.
 */
export function GET(req: NextRequest) {
  try {
    const idsRaw = req.nextUrl.searchParams.get('ids') ?? '';
    const discovery = req.nextUrl.searchParams.get('discovery') !== '0';
    const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') ?? '80', 10);
    const limit = Math.max(10, Math.min(300, Number.isFinite(limitRaw) ? limitRaw : 80));

    const poolIds = new Set(
      idsRaw
        .split(',')
        .map(s => s.trim())
        .filter(s => s.startsWith('a2-')),
    );

    const db = getDb();

    // Pull every distinct sentence-context for every A2 starter from
    // the POC corpus in one query. Heavier than per-word fetches but
    // returns ~8k rows total (95 words × ~25 contexts ÷ 3 dedupe);
    // dedup + sample happens in JS where it's expressive.
    const rows = db
      .prepare(
        `SELECT
           vw.id              AS word_id,
           vw.word,
           vw.translation_tr,
           vw.ipa,
           vw.part_of_speech,
           vw.cefr_level,
           sl.id              AS line_id,
           sl.text,
           sl.start_time      AS line_start,
           sl.end_time        AS line_end,
           sl.structure       AS structure_raw,
           c.id               AS clip_id,
           c.start_time       AS clip_start,
           c.end_time         AS clip_end,
           v.id               AS video_id,
           v.youtube_video_id,
           v.title            AS video_title,
           v.movie_title
         FROM vocab_words vw
         JOIN word_timestamps wt ON wt.starter_word_id = vw.id
         JOIN subtitle_lines sl  ON sl.id = wt.line_id
         JOIN clips c            ON c.id = sl.clip_id
         JOIN videos v           ON v.id = c.video_id
         WHERE vw.id LIKE 'a2-%'
           AND c.status = 'approved'
           AND v.poc = 1
           AND sl.text IS NOT NULL
           AND length(trim(sl.text)) > 0
         ORDER BY (sl.structure IS NULL), sl.id`,
      )
      .all() as RawRow[];

    // Dedupe by (word, sentence text) so the same line shared across
    // multiple curated clip variants only contributes once.
    const seen = new Set<string>();
    const byWord = new Map<string, RawRow[]>();
    for (const r of rows) {
      const key = `${r.word_id}|${r.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const arr = byWord.get(r.word_id) ?? [];
      arr.push(r);
      byWord.set(r.word_id, arr);
    }

    const wordContextCount = new Map<string, number>();
    for (const [id, ctxs] of byWord.entries()) wordContextCount.set(id, ctxs.length);

    // Per-word fetch shape: word's lightweight metadata cached so we
    // don't re-stringify it for every item.
    const wordMeta = new Map<string, RawRow>();
    for (const [id, ctxs] of byWord.entries()) wordMeta.set(id, ctxs[0]);

    // Pull per-word words (the per-word starter / TR mapping is needed
    // for every chosen line, so we batch it up here).
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

    const POOL_PER_WORD = 5;
    const DISCOVERY_PER_WORD = 1;

    const items: {
      wordId: string;
      word: string;
      translationTr: string | null;
      ipa: string | null;
      partOfSpeech: string | null;
      cefrLevel: string | null;
      wordContextCount: number;
      isInPool: boolean;
      context: unknown;
    }[] = [];

    for (const [wordId, ctxs] of byWord.entries()) {
      const inPool = poolIds.has(wordId);
      if (!inPool && !discovery) continue;
      const cap = inPool ? POOL_PER_WORD : DISCOVERY_PER_WORD;
      const chosen = shuffle(ctxs).slice(0, cap);

      for (const r of chosen) {
        const wordRows = wordsStmt.all(r.line_id) as {
          word: string;
          start_time: number;
          end_time: number;
          word_index: number;
          starter_word_id: string | null;
          starter_tr: string | null;
          word_tr: string | null;
        }[];

        items.push({
          wordId: r.word_id,
          word: r.word,
          translationTr: r.translation_tr,
          ipa: r.ipa,
          partOfSpeech: r.part_of_speech,
          cefrLevel: r.cefr_level,
          wordContextCount: wordContextCount.get(r.word_id) ?? 0,
          isInPool: inPool,
          context: {
            lineId: r.line_id,
            text: r.text,
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
          },
        });
      }
    }

    const shuffled = shuffleWithCooldown(items, 4);
    const capped = shuffled.slice(0, limit);

    return NextResponse.json({ items: capped, total: capped.length }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error building vocab feed:', error);
    return NextResponse.json(
      { error: 'Failed to build vocab feed' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
