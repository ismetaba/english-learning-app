/**
 * Populate clip_vocab for the A2 starter-50 set.
 *
 * For each starter lemma we expand inflections (need → needs/needed/needing,
 * think → thought, ...), scan word_timestamps once, and aggregate
 * occurrences per (clip_id, word_id). Each pair gets a single clip_vocab
 * row holding the total occurrence_count and a representative line_id.
 *
 * Idempotent for the a2-* slice: deletes existing a2-* rows from clip_vocab
 * before re-inserting. Other word_id slices (B1, etc.) are untouched.
 *
 * Mobile and the selection script both consume clip_vocab to filter videos
 * by which starter words they cover.
 *
 * Run: cd admin && npx tsx scripts/populate-clip-vocab.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import { expandInflections, type Pos } from './lib/inflections';

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Populate clip_vocab for A2 starter-50');
console.log('-------------------------------------');

// ─── 1. Load starter words ─────────────────────────────────────────────────
const starters = db
  .prepare(
    `SELECT id, word, part_of_speech AS pos FROM vocab_words WHERE cefr_level = 'a2' AND id LIKE 'a2-%'`,
  )
  .all() as { id: string; word: string; pos: Pos }[];

if (starters.length === 0) {
  console.error('No A2 starter words found in vocab_words. Run seed-a2-starter-50.ts first.');
  process.exit(1);
}
console.log(`Found ${starters.length} A2 starter words`);

// ─── 2. Build surface-form → word_id map (with conflict detection) ─────────
const surfaceToWordId = new Map<string, string>();
const conflicts: { surface: string; existing: string; rejected: string }[] = [];
for (const s of starters) {
  const forms = expandInflections(s.word, s.pos);
  for (const f of forms) {
    const lower = f.toLowerCase();
    if (surfaceToWordId.has(lower)) {
      conflicts.push({ surface: lower, existing: surfaceToWordId.get(lower)!, rejected: s.id });
    } else {
      surfaceToWordId.set(lower, s.id);
    }
  }
}
console.log(`Built ${surfaceToWordId.size} surface forms from ${starters.length} lemmas`);
if (conflicts.length > 0) {
  console.warn(`  ${conflicts.length} conflict(s):`);
  for (const c of conflicts) console.warn(`   - "${c.surface}": kept ${c.existing}, dropped ${c.rejected}`);
}

// ─── 3. Single-pass scan of word_timestamps joined with subtitle_lines ─────
console.log('Scanning word_timestamps (joined to approved clips only)...');
// Inner-join through clips so orphan subtitle_lines (whose parent clip was
// deleted without cascade) don't produce rows that would fail the
// clip_vocab.clip_id FK on insert. Also restricts to status='approved'
// since we never surface non-approved clips.
const rows = db
  .prepare(
    `SELECT wt.id AS wt_id, wt.line_id, wt.word, sl.clip_id
     FROM word_timestamps wt
     JOIN subtitle_lines sl ON sl.id = wt.line_id
     JOIN clips c          ON c.id = sl.clip_id
     WHERE c.status = 'approved'`,
  )
  .all() as { wt_id: number; line_id: number; word: string; clip_id: number }[];
console.log(`  ${rows.length.toLocaleString()} word rows to scan`);

type Acc = { clipId: number; wordId: string; firstLineId: number; count: number };
const acc = new Map<string, Acc>();
// Per-word_timestamp matches, written back to word_timestamps.starter_word_id
// so the runtime clip player can answer "is this word a starter?" without
// reapplying inflection rules on every render.
const wtMatches: { wtId: number; wordId: string }[] = [];

let hits = 0;
for (const r of rows) {
  const norm = r.word.toLowerCase().replace(/[^a-z']/g, '');
  if (!norm) continue;
  const wordId = surfaceToWordId.get(norm);
  if (!wordId) continue;
  hits++;
  wtMatches.push({ wtId: r.wt_id, wordId });
  const key = `${r.clip_id}|${wordId}`;
  const existing = acc.get(key);
  if (existing) {
    existing.count++;
  } else {
    acc.set(key, { clipId: r.clip_id, wordId, firstLineId: r.line_id, count: 1 });
  }
}
console.log(`  ${hits.toLocaleString()} starter-word hits across ${acc.size.toLocaleString()} (clip, word) pairs`);

// ─── 4. Replace clip_vocab a2-* slice atomically ───────────────────────────
const purge = db.prepare(`DELETE FROM clip_vocab WHERE word_id LIKE 'a2-%'`);
const insert = db.prepare(
  `INSERT OR REPLACE INTO clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, ?)`,
);

const writeAll = db.transaction((entries: Acc[]) => {
  const purged = purge.run().changes;
  console.log(`  purged ${purged.toLocaleString()} prior a2-* rows`);
  for (const e of entries) insert.run(e.clipId, e.wordId, e.firstLineId, e.count);
});
writeAll([...acc.values()]);
console.log(`  inserted ${acc.size.toLocaleString()} fresh a2-* rows`);

// ─── 4b. Refresh word_timestamps.starter_word_id ───────────────────────────
// First clear any prior tags, then write fresh matches. Wrapped in a single
// transaction so concurrent readers never see a partial state.
const purgeWt = db.prepare(`UPDATE word_timestamps SET starter_word_id = NULL WHERE starter_word_id IS NOT NULL`);
const updateWt = db.prepare(`UPDATE word_timestamps SET starter_word_id = ? WHERE id = ?`);
const writeWtAll = db.transaction((matches: { wtId: number; wordId: string }[]) => {
  const cleared = purgeWt.run().changes;
  console.log(`  cleared starter_word_id on ${cleared.toLocaleString()} word_timestamps rows`);
  for (const m of matches) updateWt.run(m.wordId, m.wtId);
});
writeWtAll(wtMatches);
console.log(`  set starter_word_id on ${wtMatches.length.toLocaleString()} word_timestamps rows`);

// ─── 5. Coverage summary ───────────────────────────────────────────────────
console.log('\nCoverage per starter word (top 10):');
const perWord = db
  .prepare(
    `SELECT vw.word, vw.part_of_speech AS pos,
            COUNT(DISTINCT cv.clip_id) AS clips_with_word,
            SUM(cv.occurrence_count)   AS total_occurrences
     FROM vocab_words vw
     LEFT JOIN clip_vocab cv ON cv.word_id = vw.id
     WHERE vw.id LIKE 'a2-%'
     GROUP BY vw.id
     ORDER BY clips_with_word DESC
     LIMIT 10`,
  )
  .all();
console.table(perWord);

console.log('\nCoverage per starter word (bottom 5):');
const perWordBottom = db
  .prepare(
    `SELECT vw.word, vw.part_of_speech AS pos,
            COUNT(DISTINCT cv.clip_id) AS clips_with_word,
            SUM(cv.occurrence_count)   AS total_occurrences
     FROM vocab_words vw
     LEFT JOIN clip_vocab cv ON cv.word_id = vw.id
     WHERE vw.id LIKE 'a2-%'
     GROUP BY vw.id
     ORDER BY clips_with_word ASC
     LIMIT 5`,
  )
  .all();
console.table(perWordBottom);

const videoCoverage = db
  .prepare(
    `SELECT
       COUNT(DISTINCT v.id)                                   AS total_videos,
       COUNT(DISTINCT CASE WHEN cv.word_id IS NOT NULL THEN v.id END) AS videos_with_any_starter
     FROM videos v
     LEFT JOIN clips c ON c.video_id = v.id AND c.status = 'approved'
     LEFT JOIN clip_vocab cv ON cv.clip_id = c.id AND cv.word_id LIKE 'a2-%'`,
  )
  .get() as { total_videos: number; videos_with_any_starter: number };

console.log(
  `\n${videoCoverage.videos_with_any_starter.toLocaleString()} of ${videoCoverage.total_videos.toLocaleString()} videos contain ≥1 starter word.`,
);

db.close();
console.log('\nDone.');
