/**
 * Apply sentence-structure tags from a JSON file to subtitle_lines.structure.
 * Companion to dump-poc-untagged.ts.
 *
 * Input shape (--in path):
 *   [
 *     { "id": 12345, "subject": [0], "aux_verb": [1], "rest": [2] },
 *     ...
 *   ]
 *
 * Each entry is validated against the line's word_timestamps:
 *   - every index must exist on the line
 *   - no duplicate indices across the three arrays
 *   - every word index of the line must appear exactly once
 *
 * Invalid entries are skipped and reported, never silently fixed.
 *
 * Run: cd admin && npx tsx scripts/apply-poc-tags.ts --in tags.json
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

type Tag = { id: number; subject: number[]; aux_verb: number[]; rest: number[] };

const args = process.argv.slice(2);
const inIdx = args.indexOf('--in');
const inPath = inIdx >= 0 ? args[inIdx + 1] : null;

if (!inPath) {
  console.error('Missing --in <path>');
  process.exit(1);
}
if (!fs.existsSync(inPath)) {
  console.error(`File not found: ${inPath}`);
  process.exit(1);
}

const tags = JSON.parse(fs.readFileSync(inPath, 'utf8')) as Tag[];
if (!Array.isArray(tags)) {
  console.error('Input must be a JSON array');
  process.exit(1);
}

console.log(`Applying ${tags.length} tags from ${inPath}`);

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Pre-load word_timestamps for the lines we're about to tag.
const ids = tags.map(t => t.id);
if (ids.length === 0) {
  console.log('Nothing to apply.');
  db.close();
  process.exit(0);
}
const placeholders = ids.map(() => '?').join(',');
const wordRows = db
  .prepare(
    `SELECT line_id, word_index FROM word_timestamps WHERE line_id IN (${placeholders})`,
  )
  .all(...ids) as { line_id: number; word_index: number }[];

const expectedByLine = new Map<number, Set<number>>();
for (const w of wordRows) {
  let set = expectedByLine.get(w.line_id);
  if (!set) {
    set = new Set();
    expectedByLine.set(w.line_id, set);
  }
  set.add(w.word_index);
}

const update = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let applied = 0;
let rejected = 0;
const rejections: { id: number; reason: string }[] = [];

const writeAll = db.transaction(() => {
  for (const t of tags) {
    const expected = expectedByLine.get(t.id);
    if (!expected) {
      rejected++;
      rejections.push({ id: t.id, reason: 'no word_timestamps for this line_id' });
      continue;
    }
    if (!Array.isArray(t.subject) || !Array.isArray(t.aux_verb) || !Array.isArray(t.rest)) {
      rejected++;
      rejections.push({ id: t.id, reason: 'subject/aux_verb/rest must all be arrays' });
      continue;
    }
    const all = [...t.subject, ...t.aux_verb, ...t.rest];
    const allInRange = all.every(i => expected.has(i));
    const noDupes = new Set(all).size === all.length;
    const fullCover = all.length === expected.size;
    if (!allInRange || !noDupes || !fullCover) {
      rejected++;
      rejections.push({
        id: t.id,
        reason: `in_range=${allInRange} no_dupes=${noDupes} full_cover=${fullCover} (got ${all.length}/${expected.size})`,
      });
      continue;
    }
    update.run(JSON.stringify({ subject: t.subject, aux_verb: t.aux_verb, rest: t.rest }), t.id);
    applied++;
  }
});
writeAll();

console.log(`Applied ${applied}, rejected ${rejected}`);
if (rejections.length > 0) {
  console.log('\nRejections:');
  for (const r of rejections.slice(0, 20)) {
    console.log(`  line ${r.id}: ${r.reason}`);
  }
  if (rejections.length > 20) console.log(`  ... and ${rejections.length - 20} more`);
}

db.close();
