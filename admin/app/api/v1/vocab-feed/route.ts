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

/** One (starter word, sentence) pair — just enough to dedupe, count
 *  and sample. Display columns are fetched later via `LineRow`. */
interface ContextRow {
  word_id: string;
  line_id: number;
  text: string;
}

interface WordMetaRow {
  id: string;
  word: string;
  translation_tr: string | null;
  ipa: string | null;
  part_of_speech: string | null;
  cefr_level: string | null;
}

interface LineRow {
  line_start: number;
  line_end: number;
  structure_raw: string | null;
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

    // Pull every sentence-context for every A2 starter from the POC
    // corpus in one query; dedup + sample happens in JS where it's
    // expressive. Returns ~33k rows and has to visit every word of
    // every POC line (~390k word_timestamps rows), so it is kept
    // narrow on purpose: just the ids + text needed to dedupe, count
    // and sample. Carrying the display columns (titles, structure
    // JSON, timings) through the 33k-row sort doubled its cost; they
    // are fetched below only for the few hundred contexts sampled.
    //
    // Within one line (several starters in the same sentence) rows are
    // ordered by wt.id. That decides which word is seen first and so
    // the feed's word order — pinned explicitly instead of being left
    // to the sorter.
    const rows = db
      .prepare(
        `SELECT
           vw.id              AS word_id,
           sl.id              AS line_id,
           sl.text
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
           -- Drop pathological subtitle lines (a few "whoa whoa whoa…"
           -- repeats and whole monologues). They render as a flowed wall
           -- of words on the reels card, way past anything readable;
           -- proper sentence-splitting + word_timestamps reassignment
           -- needs a separate data migration pass.
           AND length(sl.text) <= 120
         ORDER BY (sl.structure IS NULL), sl.id, wt.id`,
      )
      .all() as ContextRow[];

    // Dedupe by (word, sentence text) so the same line shared across
    // multiple curated clip variants only contributes once.
    const seen = new Set<string>();
    const byWord = new Map<string, ContextRow[]>();
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

    // Starter metadata (word, TR, IPA, …) for every A2 word, one query.
    const wordMeta = new Map<string, WordMetaRow>(
      (
        db
          .prepare(
            `SELECT id, word, translation_tr, ipa, part_of_speech, cefr_level
             FROM vocab_words
             WHERE id LIKE 'a2-%'`,
          )
          .all() as WordMetaRow[]
      ).map(w => [w.id, w]),
    );

    // Display columns for one sampled line: three rowid / primary-key
    // lookups, run only for the contexts that make it into the feed.
    const lineStmt = db.prepare(
      `SELECT
         sl.start_time      AS line_start,
         sl.end_time        AS line_end,
         sl.structure       AS structure_raw,
         c.start_time       AS clip_start,
         c.end_time         AS clip_end,
         v.id               AS video_id,
         v.youtube_video_id,
         v.title            AS video_title,
         v.movie_title
       FROM subtitle_lines sl
       JOIN clips c  ON c.id = sl.clip_id
       JOIN videos v ON v.id = c.video_id
       WHERE sl.id = ?`,
    );

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

    // Load phrase translations once for the whole request — small dict
    // (~30 entries) keyed by lowercased phrase; cheap to scan.
    const phraseRows = db
      .prepare(`SELECT phrase, translation_tr FROM phrase_translations`)
      .all() as { phrase: string; translation_tr: string }[];
    const phraseDict = new Map<string, string>(
      phraseRows.map(r => [r.phrase.toLowerCase(), r.translation_tr]),
    );

    // Strip wrapping punctuation so "off." matches "off" in the dict.
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
        const bigram = `${w1} ${w2}`;
        const tr = phraseDict.get(bigram);
        if (tr) {
          out.push({
            startIndex: ws[i].word_index,
            endIndex: ws[i + 1].word_index,
            translationTr: tr,
            joinedText: `${ws[i].word} ${ws[i + 1].word}`,
          });
          i += 2; // skip past the second word — already consumed
        } else {
          i += 1;
        }
      }
      return out;
    }

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
      const meta = wordMeta.get(wordId);

      for (const r of chosen) {
        const line = lineStmt.get(r.line_id) as LineRow | undefined;
        // Only possible if the line / word was deleted between the two
        // reads (an admin edit mid-request); skip it rather than 500.
        if (!meta || !line) continue;

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
          word: meta.word,
          translationTr: meta.translation_tr,
          ipa: meta.ipa,
          partOfSpeech: meta.part_of_speech,
          cefrLevel: meta.cefr_level,
          wordContextCount: wordContextCount.get(r.word_id) ?? 0,
          isInPool: inPool,
          context: {
            lineId: r.line_id,
            text: r.text,
            startTime: line.line_start,
            endTime: line.line_end,
            clipStartTime: line.clip_start,
            clipEndTime: line.clip_end,
            structure: parseStructure(line.structure_raw),
            videoId: line.video_id,
            youtubeVideoId: line.youtube_video_id,
            videoTitle: line.video_title,
            movieTitle: line.movie_title,
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
            phrases: detectPhrases(wordRows),
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
