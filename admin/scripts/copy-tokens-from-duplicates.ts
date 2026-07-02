/**
 * Copy word_timestamps + structure from duplicate subtitle_lines.
 *
 * The new POC videos contain duplicate subtitle_lines rows: each clip's
 * lines were seemingly imported twice — once with word_timestamps
 * populated by whisperx, once without. Both copies share the exact same
 * text + start_time + end_time. This script finds every POC line that
 * lacks word_timestamps and copies them in from any duplicate that has
 * them. structure is also copied across when the donor has it. After
 * running, the new POC videos go from ~50% to ~100% token coverage.
 *
 * Idempotent — only writes to lines that currently lack
 * word_timestamps / structure.
 *
 * Run: cd admin && npx tsx scripts/copy-tokens-from-duplicates.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Copy word_timestamps + structure from duplicates');
console.log('-----');

// ─── 1. Find recipient (missing) lines and their donors ─────────────────────
const recipients = db
  .prepare(
    `SELECT sl.id AS recipient_id, sl.text, sl.start_time, sl.end_time, sl.structure AS recipient_structure
     FROM subtitle_lines sl
     JOIN clips c  ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0
       AND NOT EXISTS (SELECT 1 FROM word_timestamps WHERE line_id = sl.id)`,
  )
  .all() as {
  recipient_id: number;
  text: string;
  start_time: number;
  end_time: number;
  recipient_structure: string | null;
}[];
console.log(`Recipients (POC, no tokens): ${recipients.length.toLocaleString()}`);
if (recipients.length === 0) {
  db.close();
  process.exit(0);
}

const findDonor = db.prepare(
  `SELECT id, structure
     FROM subtitle_lines
     WHERE text = ? AND start_time = ? AND end_time = ?
       AND EXISTS (SELECT 1 FROM word_timestamps WHERE line_id = subtitle_lines.id)
     LIMIT 1`,
);
const fetchDonorTokens = db.prepare(
  `SELECT word_index, word, start_time, end_time, starter_word_id
     FROM word_timestamps
     WHERE line_id = ?
     ORDER BY word_index`,
);
const insertToken = db.prepare(
  `INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time, starter_word_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const updateStructure = db.prepare(
  `UPDATE subtitle_lines SET structure = ? WHERE id = ? AND structure IS NULL`,
);

let copiedTokens = 0;
let copiedStructure = 0;
let failedNoDonor = 0;

const tx = db.transaction(() => {
  for (const r of recipients) {
    const donor = findDonor.get(r.text, r.start_time, r.end_time) as
      | { id: number; structure: string | null }
      | undefined;
    if (!donor) {
      failedNoDonor++;
      continue;
    }
    const tokens = fetchDonorTokens.all(donor.id) as {
      word_index: number;
      word: string;
      start_time: number;
      end_time: number;
      starter_word_id: string | null;
    }[];
    for (const t of tokens) {
      insertToken.run(
        r.recipient_id,
        t.word_index,
        t.word,
        t.start_time,
        t.end_time,
        t.starter_word_id,
      );
      copiedTokens++;
    }
    if (r.recipient_structure === null && donor.structure !== null) {
      updateStructure.run(donor.structure, r.recipient_id);
      copiedStructure++;
    }
  }
});
tx();

console.log(
  `\nInserted ${copiedTokens.toLocaleString()} word_timestamps rows across ${recipients.length - failedNoDonor} recipient lines.`,
);
console.log(`Copied structure on ${copiedStructure.toLocaleString()} lines.`);
if (failedNoDonor > 0) {
  console.log(`Recipients without a donor (skipped): ${failedNoDonor}`);
}

const cov = db
  .prepare(
    `SELECT
       SUM(CASE WHEN EXISTS(SELECT 1 FROM word_timestamps WHERE line_id=sl.id) THEN 1 ELSE 0 END) AS with_tokens,
       SUM(CASE WHEN sl.structure IS NOT NULL THEN 1 ELSE 0 END) AS with_structure,
       COUNT(*) AS total
     FROM subtitle_lines sl
     JOIN clips c ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1 AND c.status = 'approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0`,
  )
  .get() as { with_tokens: number; with_structure: number; total: number };
console.log(
  `\nPOC coverage:
  word_timestamps: ${cov.with_tokens.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.with_tokens) / cov.total).toFixed(1)}%)
  structure:       ${cov.with_structure.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.with_structure) / cov.total).toFixed(1)}%)`,
);

db.close();
