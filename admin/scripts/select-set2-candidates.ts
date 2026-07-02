/**
 * Score and pick 100 videos for "Beginner Mix 2" — videos that practice
 * the same A2 vocabulary as set 1 but aren't already in it.
 *
 * Score is the existing composite (slow speech + simple vocab + short
 * sentences + starter-word coverage) plus a bonus for overlap with the
 * specific words set 1 emphasises.
 *
 * Run: cd admin && npx tsx scripts/select-set2-candidates.ts > /tmp/set2-candidates.txt
 */
import Database from 'better-sqlite3';
import path from 'path';

const TARGET = 200; // pick more candidates than 100 so we can filter content

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. Words emphasised by set 1 (with their occurrence counts as weights)
const set1Words = db
  .prepare(
    `SELECT cv.word_id, SUM(cv.occurrence_count) AS w
     FROM clip_vocab cv
     JOIN clips c ON c.id=cv.clip_id
     WHERE c.video_id IN (SELECT video_id FROM video_set_items WHERE set_id='beginner-animation-1')
       AND c.status='approved' AND cv.word_id LIKE 'a2-%'
     GROUP BY cv.word_id`,
  )
  .all() as { word_id: string; w: number }[];
const wordWeights = new Map(set1Words.map(r => [r.word_id, r.w]));
const totalSet1 = [...wordWeights.values()].reduce((s, n) => s + n, 0);

// 2. Healthy-zone aggregates per video
const healthy = db
  .prepare(
    `SELECT video_id, AVG(wpm) avg_wpm, AVG(a2_ratio) avg_a2, AVG(avg_sentence_len) avg_len, COUNT(*) clips
     FROM clips
     WHERE status='approved' AND wpm BETWEEN 80 AND 200
       AND avg_sentence_len BETWEEN 3 AND 12
     GROUP BY video_id`,
  )
  .all() as { video_id: string; avg_wpm: number; avg_a2: number; avg_len: number; clips: number }[];

// 3. Per-video starter coverage (counts only A2 starters)
const starters = db
  .prepare(
    `SELECT c.video_id, cv.word_id, SUM(cv.occurrence_count) hits
     FROM clip_vocab cv
     JOIN clips c ON c.id=cv.clip_id
     WHERE c.status='approved' AND cv.word_id LIKE 'a2-%'
     GROUP BY c.video_id, cv.word_id`,
  )
  .all() as { video_id: string; word_id: string; hits: number }[];
type Cov = { distinct: Set<string>; total: number; weighted: number };
const covByVideo = new Map<string, Cov>();
for (const s of starters) {
  let c = covByVideo.get(s.video_id);
  if (!c) {
    c = { distinct: new Set(), total: 0, weighted: 0 };
    covByVideo.set(s.video_id, c);
  }
  c.distinct.add(s.word_id);
  c.total += s.hits;
  c.weighted += s.hits * (wordWeights.get(s.word_id) ?? 1) / totalSet1;
}

// 4. Translation coverage (lines with Turkish — to know how much work to do)
const trCov = db
  .prepare(
    `SELECT c.video_id,
       COUNT(*) total_lines,
       SUM(CASE WHEN sl.translation_tr IS NOT NULL AND length(trim(sl.translation_tr))>0 THEN 1 ELSE 0 END) tr_lines
     FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id
     WHERE c.status='approved'
     GROUP BY c.video_id`,
  )
  .all() as { video_id: string; total_lines: number; tr_lines: number }[];
const trByVideo = new Map(trCov.map(r => [r.video_id, r]));

// 5. Excluded videos: already in set 1
const excluded = new Set(
  (db
    .prepare(`SELECT video_id FROM video_set_items WHERE set_id='beginner-animation-1'`)
    .all() as { video_id: string }[])
    .map(r => r.video_id),
);

// 6. Score
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

interface Cand {
  videoId: string;
  movie: string;
  title: string;
  ytId: string;
  avgWpm: number;
  avgA2: number;
  avgLen: number;
  healthyClips: number;
  distinctStarters: number;
  totalStarterHits: number;
  weightedHits: number;
  totalLines: number;
  trLines: number;
  composite: number;
}

const titleStmt = db.prepare(
  `SELECT id, movie_title, title, youtube_video_id FROM videos WHERE id = ?`,
);
const candidates: Cand[] = [];
for (const h of healthy) {
  if (excluded.has(h.video_id)) continue;
  const cov = covByVideo.get(h.video_id);
  if (!cov || cov.distinct.size === 0) continue;
  const tr = trByVideo.get(h.video_id) ?? { total_lines: 0, tr_lines: 0 };
  const meta = titleStmt.get(h.video_id) as
    | { movie_title: string; title: string; youtube_video_id: string }
    | undefined;
  if (!meta) continue;

  const speed = clamp01(1 - (h.avg_wpm - 80) / 120);
  const vocab = clamp01((h.avg_a2 - 0.7) / 0.3);
  const length = clamp01(1 - (h.avg_len - 3) / 9);
  const distinctScore = clamp01(cov.distinct.size / 15);
  const occScore = clamp01(cov.total / 30);
  const overlapBonus = clamp01(cov.weighted * 5); // emphasises words frequent in set 1

  const composite =
    0.18 * speed +
    0.18 * vocab +
    0.12 * length +
    0.22 * distinctScore +
    0.15 * occScore +
    0.15 * overlapBonus;

  candidates.push({
    videoId: h.video_id,
    movie: meta.movie_title,
    title: meta.title,
    ytId: meta.youtube_video_id,
    avgWpm: h.avg_wpm,
    avgA2: h.avg_a2,
    avgLen: h.avg_len,
    healthyClips: h.clips,
    distinctStarters: cov.distinct.size,
    totalStarterHits: cov.total,
    weightedHits: cov.weighted,
    totalLines: tr.total_lines,
    trLines: tr.tr_lines,
    composite,
  });
}

candidates.sort((a, b) => b.composite - a.composite);
const top = candidates.slice(0, TARGET);

console.log('rank\tscore\tvideo_id\tmovie\twpm\ta2\tlen\tstart\thits\tlines\ttr');
top.forEach((c, i) => {
  console.log(
    `${i + 1}\t${c.composite.toFixed(3)}\t${c.videoId}\t${c.movie?.slice(0, 38) ?? ''}\t${Math.round(c.avgWpm)}\t${c.avgA2.toFixed(2)}\t${c.avgLen.toFixed(1)}\t${c.distinctStarters}\t${c.totalStarterHits}\t${c.totalLines}\t${c.trLines}`,
  );
});

console.log(`\n# stats: ${candidates.length} eligible candidates, top ${top.length} listed`);
console.log(
  `# avg-wpm of top: ${(top.reduce((s, c) => s + c.avgWpm, 0) / top.length).toFixed(0)}, avg-a2: ${(top.reduce((s, c) => s + c.avgA2, 0) / top.length).toFixed(2)}`,
);

db.close();
