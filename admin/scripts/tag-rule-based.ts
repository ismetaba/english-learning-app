/**
 * Apply the deterministic rule-based tagger to lines that lack structure.
 * No LLM. Sub-second per 1k lines.
 *
 * Run: cd admin && npx tsx scripts/tag-rule-based.ts [flags]
 *   --dry-run               don't write
 *   --all                   override existing structure (use with care)
 *   --include-non-poc       also tag approved clips outside the POC set
 *                           (ten-x larger pool — needed when the patterns
 *                           akış is starved on the curated subset)
 */
import Database from 'better-sqlite3';
import path from 'path';
import { tagSentence } from './rule-based-tagger';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const INCLUDE_NON_POC = args.includes('--include-non-poc');

const DB_PATH = process.env.DATABASE_PATH ?? path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const pocFilter = INCLUDE_NON_POC ? '' : 'AND v.poc=1';
const lines = db
  .prepare(
    `SELECT sl.id FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id
     WHERE c.status='approved' ${pocFilter}
       AND sl.text IS NOT NULL AND length(trim(sl.text))>0
       ${ALL ? '' : 'AND sl.structure IS NULL'}`,
  )
  .all() as { id: number }[];

const scopeLabel = INCLUDE_NON_POC ? 'all approved' : 'POC';
console.log(`${scopeLabel} lines to tag: ${lines.length.toLocaleString()}${ALL ? ' (overriding existing)' : ''}`);

const fetchTokens = db.prepare(
  `SELECT word_index, word FROM word_timestamps WHERE line_id = ? ORDER BY word_index`,
);
const updateStruct = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let tagged = 0;
let noTokens = 0;
const start = Date.now();

const tx = db.transaction(() => {
  for (const l of lines) {
    const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
    if (tokens.length === 0) {
      noTokens++;
      continue;
    }
    const words = tokens.map(t => t.word);
    const pred = tagSentence(words);
    // Map local indices back to original word_index values
    const subject = pred.subject.map(i => tokens[i].word_index).sort((a, b) => a - b);
    const aux_verb = pred.aux_verb.map(i => tokens[i].word_index).sort((a, b) => a - b);
    const rest = pred.rest.map(i => tokens[i].word_index).sort((a, b) => a - b);
    const json = JSON.stringify({ subject, aux_verb, rest });
    if (!DRY_RUN) updateStruct.run(json, l.id);
    tagged++;
  }
});
tx();

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nTagged ${tagged.toLocaleString()} lines in ${elapsed}s.`);
console.log(`Skipped (no tokens): ${noTokens.toLocaleString()}`);

const cov = db
  .prepare(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN sl.structure IS NOT NULL THEN 1 ELSE 0 END) AS tagged
     FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id
     WHERE c.status='approved' ${pocFilter}
       AND sl.text IS NOT NULL AND length(trim(sl.text))>0`,
  )
  .get() as { total: number; tagged: number };
console.log(
  `\n${scopeLabel} structure coverage: ${cov.tagged.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.tagged) / cov.total).toFixed(1)}%)`,
);

db.close();
