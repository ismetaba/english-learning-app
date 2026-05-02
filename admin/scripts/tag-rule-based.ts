/**
 * Apply the deterministic rule-based tagger to every POC line that lacks
 * structure. No LLM. Sub-second per 1k lines.
 *
 * Run: cd admin && npx tsx scripts/tag-rule-based.ts [--dry-run] [--all]
 *   --all overrides existing structure on POC lines (use with care)
 */
import Database from 'better-sqlite3';
import path from 'path';
import { tagSentence } from './rule-based-tagger';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const lines = db
  .prepare(
    `SELECT sl.id FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id
     WHERE v.poc=1 AND c.status='approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text))>0
       ${ALL ? '' : 'AND sl.structure IS NULL'}`,
  )
  .all() as { id: number }[];

console.log(`POC lines to tag: ${lines.length.toLocaleString()}${ALL ? ' (overriding existing)' : ''}`);

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
     WHERE v.poc=1 AND c.status='approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text))>0`,
  )
  .get() as { total: number; tagged: number };
console.log(
  `\nPOC structure coverage: ${cov.tagged.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.tagged) / cov.total).toFixed(1)}%)`,
);

db.close();
