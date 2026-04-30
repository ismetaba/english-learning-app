/**
 * Compute clip-level difficulty signals: wpm, avg_sentence_len, a2_ratio.
 *
 * Method:
 *   1. Tokenize all subtitle_lines.text across the corpus → word frequency map.
 *   2. Take the top N most-frequent words as "common vocabulary" (proxy for
 *      A1-A2 ease — function words AND common content words BOTH legitimately
 *      signal easier text). Dump the list to assets/wordlists/ for inspection.
 *   3. For each approved clip, compute:
 *        - wpm              = total_words / clip_duration_seconds * 60
 *        - avg_sentence_len = total_words / line_count
 *        - a2_ratio         = common_words / total_words
 *      All three are independent signals; the selection step combines them.
 *
 * Idempotent: simply re-runs and overwrites previous values.
 *
 * Run: cd admin && npx tsx scripts/compute-clip-difficulty.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const TOP_N_COMMON = 1500;
const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const WORDLIST_OUT = path.join(
  __dirname,
  '..',
  '..',
  'assets',
  'wordlists',
  'common-from-corpus-top1500.json',
);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, '');
}

console.log('Compute clip difficulty');
console.log('-----------------------');

// ─── 1. Build global word frequency from all subtitle text ─────────────────
console.log('1) Scanning subtitle_lines for global word frequency...');
const allTexts = db.prepare(`SELECT text FROM subtitle_lines`).all() as { text: string }[];
const freq = new Map<string, number>();
for (const { text } of allTexts) {
  for (const raw of text.split(/\s+/)) {
    const w = normalize(raw);
    if (w.length === 0) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
}
const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
const topCommon = new Set(sorted.slice(0, TOP_N_COMMON).map(([w]) => w));
console.log(`   ${freq.size.toLocaleString()} unique tokens; top ${TOP_N_COMMON} retained as "common vocab"`);

// Side-effect: persist the list so we can audit it
fs.writeFileSync(
  WORDLIST_OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'derived from subtitle_lines.text frequency across the full corpus',
      totalUniqueTokens: freq.size,
      topN: TOP_N_COMMON,
      words: sorted.slice(0, TOP_N_COMMON).map(([word, count]) => ({ word, count })),
    },
    null,
    2,
  ),
);
console.log(`   wrote ${WORDLIST_OUT}`);

// ─── 2. Bulk-load word_timestamps grouped by line_id ───────────────────────
console.log('\n2) Loading word_timestamps...');
const allWords = db
  .prepare(`SELECT line_id, word FROM word_timestamps`)
  .all() as { line_id: number; word: string }[];
console.log(`   ${allWords.length.toLocaleString()} rows`);

const wordsByLine = new Map<number, string[]>();
for (const r of allWords) {
  let arr = wordsByLine.get(r.line_id);
  if (!arr) {
    arr = [];
    wordsByLine.set(r.line_id, arr);
  }
  arr.push(r.word);
}
console.log(`   grouped into ${wordsByLine.size.toLocaleString()} lines`);

// ─── 3. Build clip → line ids mapping ──────────────────────────────────────
console.log('\n3) Mapping subtitle_lines to clips...');
const lineRows = db
  .prepare(`SELECT id, clip_id FROM subtitle_lines`)
  .all() as { id: number; clip_id: number }[];
const linesByClip = new Map<number, number[]>();
for (const r of lineRows) {
  let arr = linesByClip.get(r.clip_id);
  if (!arr) {
    arr = [];
    linesByClip.set(r.clip_id, arr);
  }
  arr.push(r.id);
}
console.log(`   ${linesByClip.size.toLocaleString()} clips have subtitle lines`);

// ─── 4. Compute per-clip metrics ───────────────────────────────────────────
console.log('\n4) Computing wpm / avg_sentence_len / a2_ratio per approved clip...');
const clips = db
  .prepare(`SELECT id, start_time, end_time FROM clips WHERE status = 'approved'`)
  .all() as { id: number; start_time: number; end_time: number }[];
console.log(`   ${clips.length.toLocaleString()} approved clips`);

type Result = {
  id: number;
  wpm: number | null;
  a2_ratio: number | null;
  avg_sentence_len: number | null;
};
const results: Result[] = [];
let skipped = 0;

for (const clip of clips) {
  const lineIds = linesByClip.get(clip.id) ?? [];
  let totalWords = 0;
  let inCommon = 0;
  for (const lineId of lineIds) {
    const ws = wordsByLine.get(lineId);
    if (!ws) continue;
    for (const raw of ws) {
      const norm = normalize(raw);
      if (norm.length === 0) continue;
      totalWords++;
      if (topCommon.has(norm)) inCommon++;
    }
  }

  const duration = clip.end_time - clip.start_time;
  if (totalWords === 0 || duration <= 0 || lineIds.length === 0) {
    results.push({ id: clip.id, wpm: null, a2_ratio: null, avg_sentence_len: null });
    skipped++;
    continue;
  }

  const wpm = (totalWords / duration) * 60;
  const a2_ratio = inCommon / totalWords;
  const avg_sentence_len = totalWords / lineIds.length;
  results.push({ id: clip.id, wpm, a2_ratio, avg_sentence_len });
}

console.log(`   computed ${results.length - skipped}, skipped ${skipped} (no words / no lines / zero-duration)`);

// ─── 5. Write back in a single transaction ─────────────────────────────────
console.log('\n5) Writing back...');
const update = db.prepare(
  `UPDATE clips SET wpm = ?, a2_ratio = ?, avg_sentence_len = ? WHERE id = ?`,
);
const tx = db.transaction((rows: Result[]) => {
  for (const r of rows) update.run(r.wpm, r.a2_ratio, r.avg_sentence_len, r.id);
});
tx(results);
console.log(`   updated ${results.length.toLocaleString()} clips`);

// ─── 6. Distribution summary ───────────────────────────────────────────────
const stats = db
  .prepare(
    `
  SELECT
    COUNT(*)                                   AS n,
    ROUND(AVG(wpm), 1)                         AS wpm_avg,
    ROUND(MIN(wpm), 1)                         AS wpm_min,
    ROUND(MAX(wpm), 1)                         AS wpm_max,
    ROUND(AVG(a2_ratio), 3)                    AS a2_avg,
    ROUND(MIN(a2_ratio), 3)                    AS a2_min,
    ROUND(MAX(a2_ratio), 3)                    AS a2_max,
    ROUND(AVG(avg_sentence_len), 2)            AS sent_len_avg,
    ROUND(MIN(avg_sentence_len), 2)            AS sent_len_min,
    ROUND(MAX(avg_sentence_len), 2)            AS sent_len_max
  FROM clips WHERE status = 'approved' AND wpm IS NOT NULL
`,
  )
  .get();

console.log('\nDistribution (clips with metrics):');
console.log(stats);

// Show 5 easiest and 5 hardest by composite (lower wpm + higher a2_ratio + lower sent_len = easier)
const easiestQ = db.prepare(`
  SELECT c.id, c.video_id, v.movie_title, ROUND(c.wpm, 0) AS wpm, ROUND(c.a2_ratio, 2) AS a2, ROUND(c.avg_sentence_len, 1) AS sent_len
  FROM clips c JOIN videos v ON v.id = c.video_id
  WHERE c.status = 'approved' AND c.wpm IS NOT NULL AND c.a2_ratio IS NOT NULL
  ORDER BY (c.wpm / 200.0) + (1.0 - c.a2_ratio) + (c.avg_sentence_len / 30.0) ASC
  LIMIT 5
`);
const hardestQ = db.prepare(`
  SELECT c.id, c.video_id, v.movie_title, ROUND(c.wpm, 0) AS wpm, ROUND(c.a2_ratio, 2) AS a2, ROUND(c.avg_sentence_len, 1) AS sent_len
  FROM clips c JOIN videos v ON v.id = c.video_id
  WHERE c.status = 'approved' AND c.wpm IS NOT NULL AND c.a2_ratio IS NOT NULL
  ORDER BY (c.wpm / 200.0) + (1.0 - c.a2_ratio) + (c.avg_sentence_len / 30.0) DESC
  LIMIT 5
`);

console.log('\n5 easiest clips (by composite score):');
console.table(easiestQ.all());
console.log('\n5 hardest clips (by composite score):');
console.table(hardestQ.all());

db.close();
console.log('\nDone.');
