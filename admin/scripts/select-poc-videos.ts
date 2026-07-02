/**
 * Select 100 videos for the Feynman video-first POC.
 *
 * Scoring is a weighted composite across five normalized signals:
 *
 *   - speed_score    (0.20)  : 1 at avg_wpm = 80,    0 at >= 200
 *   - vocab_score    (0.20)  : 0 at avg_a2_ratio = 0.7, 1 at 1.0
 *   - length_score   (0.15)  : 1 at avg_sent_len = 3,  0 at >= 12
 *   - distinct_score (0.30)  : 0 at 0 starter words covered, 1 at 15+
 *   - occurrence_score (0.15): 0 at 0 starter hits,            1 at 30+
 *
 * Difficulty signals (speed/vocab/length) are aggregated only over the
 * video's CLIPS IN THE HEALTHY ZONE (80 ≤ wpm ≤ 200, 3 ≤ avg_sent_len ≤ 12)
 * so broken Whisper data doesn't poison the average. Starter coverage is
 * counted across all approved clips because the words themselves are valid
 * even when timing metrics are noisy.
 *
 * Filters applied before scoring:
 *   - video must have ≥1 approved clip in the healthy zone
 *   - video must contain ≥1 starter-50 word (so the word-set rotation has
 *     something to land on)
 *
 * Idempotent: resets videos.poc to 0 in the same transaction that sets the
 * winning 100 to 1.
 *
 * Run: cd admin && npx tsx scripts/select-poc-videos.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const HEALTHY_WPM_MIN = 80;
const HEALTHY_WPM_MAX = 200;
const HEALTHY_SENT_LEN_MIN = 3;
const HEALTHY_SENT_LEN_MAX = 12;
const TARGET_POC_SIZE = 1;

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Select POC videos');
console.log('-----------------');

// ─── 1. Healthy-zone clips → per-video difficulty aggregates ───────────────
console.log('1) Aggregating healthy clips per video...');
const healthyClips = db
  .prepare(
    `SELECT video_id, wpm, a2_ratio, avg_sentence_len
     FROM clips
     WHERE status = 'approved'
       AND wpm IS NOT NULL AND wpm BETWEEN ? AND ?
       AND avg_sentence_len IS NOT NULL AND avg_sentence_len BETWEEN ? AND ?`,
  )
  .all(HEALTHY_WPM_MIN, HEALTHY_WPM_MAX, HEALTHY_SENT_LEN_MIN, HEALTHY_SENT_LEN_MAX) as {
  video_id: string;
  wpm: number;
  a2_ratio: number;
  avg_sentence_len: number;
}[];
console.log(`   ${healthyClips.length.toLocaleString()} healthy clips`);

type DiffAgg = { count: number; wpmSum: number; a2Sum: number; lenSum: number };
const diffByVideo = new Map<string, DiffAgg>();
for (const c of healthyClips) {
  let agg = diffByVideo.get(c.video_id);
  if (!agg) {
    agg = { count: 0, wpmSum: 0, a2Sum: 0, lenSum: 0 };
    diffByVideo.set(c.video_id, agg);
  }
  agg.count++;
  agg.wpmSum += c.wpm;
  agg.a2Sum += c.a2_ratio;
  agg.lenSum += c.avg_sentence_len;
}
console.log(`   ${diffByVideo.size.toLocaleString()} videos have ≥1 healthy clip`);

// ─── 2. Starter coverage per video (across all approved clips) ─────────────
console.log('\n2) Aggregating starter coverage per video...');
const starterRows = db
  .prepare(
    `SELECT c.video_id, cv.word_id, cv.occurrence_count
     FROM clip_vocab cv
     JOIN clips c ON c.id = cv.clip_id
     WHERE c.status = 'approved' AND cv.word_id LIKE 'a2-%'`,
  )
  .all() as { video_id: string; word_id: string; occurrence_count: number }[];

type Coverage = { distinctSet: Set<string>; totalHits: number };
const coverageByVideo = new Map<string, Coverage>();
for (const r of starterRows) {
  let cov = coverageByVideo.get(r.video_id);
  if (!cov) {
    cov = { distinctSet: new Set(), totalHits: 0 };
    coverageByVideo.set(r.video_id, cov);
  }
  cov.distinctSet.add(r.word_id);
  cov.totalHits += r.occurrence_count;
}
console.log(`   ${coverageByVideo.size.toLocaleString()} videos cover ≥1 starter word`);

// ─── 3. Score eligible candidates ──────────────────────────────────────────
console.log('\n3) Scoring candidates...');

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

type Candidate = {
  videoId: string;
  healthyCount: number;
  avgWpm: number;
  avgA2: number;
  avgLen: number;
  distinctStarters: number;
  totalStarterHits: number;
  composite: number;
};

const candidates: Candidate[] = [];
for (const [videoId, agg] of diffByVideo) {
  if (agg.count === 0) continue;
  const cov = coverageByVideo.get(videoId);
  if (!cov || cov.distinctSet.size === 0) continue;

  const avgWpm = agg.wpmSum / agg.count;
  const avgA2 = agg.a2Sum / agg.count;
  const avgLen = agg.lenSum / agg.count;
  const distinct = cov.distinctSet.size;
  const total = cov.totalHits;

  const speed = clamp01(1 - (avgWpm - 80) / 120);
  const vocab = clamp01((avgA2 - 0.7) / 0.3);
  const length = clamp01(1 - (avgLen - 3) / 9);
  const distinctScore = clamp01(distinct / 15);
  const occScore = clamp01(total / 30);

  const composite =
    0.2 * speed + 0.2 * vocab + 0.15 * length + 0.3 * distinctScore + 0.15 * occScore;

  candidates.push({
    videoId,
    healthyCount: agg.count,
    avgWpm,
    avgA2,
    avgLen,
    distinctStarters: distinct,
    totalStarterHits: total,
    composite,
  });
}

candidates.sort((a, b) => b.composite - a.composite);
const winners = candidates.slice(0, TARGET_POC_SIZE);
const losers = candidates.slice(TARGET_POC_SIZE);

console.log(`   ${candidates.length.toLocaleString()} eligible candidates → picking top ${TARGET_POC_SIZE}`);

// ─── 4. Persist (atomic reset + flag) ──────────────────────────────────────
console.log('\n4) Setting videos.poc...');
const reset = db.prepare(`UPDATE videos SET poc = 0 WHERE poc = 1`);
const flag = db.prepare(`UPDATE videos SET poc = 1 WHERE id = ?`);
const persist = db.transaction((winnerIds: string[]) => {
  const cleared = reset.run().changes;
  for (const id of winnerIds) flag.run(id);
  return cleared;
});
const cleared = persist(winners.map(w => w.videoId));
console.log(`   reset ${cleared} prior POC flags, set ${winners.length} new ones`);

// ─── 5. Show summary tables ────────────────────────────────────────────────
const annotate = (rows: Candidate[]) => {
  const ids = rows.map(r => r.videoId);
  const titles = db
    .prepare(`SELECT id, movie_title, title FROM videos WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { id: string; movie_title: string; title: string }[];
  const map = new Map(titles.map(t => [t.id, t]));
  return rows.map(r => ({
    movie: map.get(r.videoId)?.movie_title?.slice(0, 38) ?? '?',
    wpm: Math.round(r.avgWpm),
    a2: r.avgA2.toFixed(2),
    sent_len: r.avgLen.toFixed(1),
    starters: r.distinctStarters,
    hits: r.totalStarterHits,
    score: r.composite.toFixed(3),
  }));
};

console.log('\nTop 10 of selected:');
console.table(annotate(winners.slice(0, 10)));

console.log('\nBottom 10 of selected (cutoff zone):');
console.table(annotate(winners.slice(-10)));

console.log('\nFirst 5 just below cutoff (compare):');
console.table(annotate(losers.slice(0, 5)));

const winSummary = (() => {
  const n = winners.length || 1;
  return {
    avg_wpm: (winners.reduce((s, w) => s + w.avgWpm, 0) / n).toFixed(1),
    avg_a2: (winners.reduce((s, w) => s + w.avgA2, 0) / n).toFixed(3),
    avg_sent_len: (winners.reduce((s, w) => s + w.avgLen, 0) / n).toFixed(2),
    avg_distinct_starters: (winners.reduce((s, w) => s + w.distinctStarters, 0) / n).toFixed(1),
    avg_total_starter_hits: (winners.reduce((s, w) => s + w.totalStarterHits, 0) / n).toFixed(1),
    min_score: winners[winners.length - 1]?.composite.toFixed(3),
    max_score: winners[0]?.composite.toFixed(3),
  };
})();
console.log('\nAggregate stats across the chosen 100:');
console.log(winSummary);

// Coverage union: how many DISTINCT starter words does the chosen set cover?
const coverageUnion = new Set<string>();
for (const w of winners) {
  const cov = coverageByVideo.get(w.videoId);
  if (cov) for (const id of cov.distinctSet) coverageUnion.add(id);
}
console.log(`\nThe chosen 100 collectively cover ${coverageUnion.size}/50 starter words.`);

if (coverageUnion.size < 50) {
  const missing = db
    .prepare(`SELECT id, word, part_of_speech FROM vocab_words WHERE id LIKE 'a2-%'`)
    .all() as { id: string; word: string; part_of_speech: string }[];
  const missed = missing.filter(m => !coverageUnion.has(m.id));
  console.log(`   not covered: ${missed.map(m => `${m.word} (${m.part_of_speech})`).join(', ')}`);
}

db.close();
console.log('\nDone.');
