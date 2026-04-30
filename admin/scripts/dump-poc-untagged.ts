/**
 * Dump untagged POC subtitle lines (with their word_timestamps) to a JSON
 * file. Companion to apply-poc-tags.ts: the in-conversation tagger reads
 * this dump, writes a sibling tags file, and apply-poc-tags.ts persists.
 *
 * Output shape:
 *   [
 *     { "id": 12345, "text": "Hello world", "tokens": [[0,"Hello"],[1,"world"]] },
 *     ...
 *   ]
 *
 * Run: cd admin && npx tsx scripts/dump-poc-untagged.ts --limit 50 --out batch.json
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const outIdx = args.indexOf('--out');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '50', 10) : 50;
const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', 'tagging-batch.json');

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Bad --limit value');
  process.exit(1);
}
if (!outPath) {
  console.error('Missing --out path');
  process.exit(1);
}

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const lines = db
  .prepare(
    `SELECT sl.id, sl.text
     FROM subtitle_lines sl
     JOIN clips c  ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND sl.structure IS NULL
       AND sl.text IS NOT NULL
       AND length(trim(sl.text)) > 0
     ORDER BY sl.id
     LIMIT ?`,
  )
  .all(limit) as { id: number; text: string }[];

if (lines.length === 0) {
  console.log('No untagged POC lines found.');
  fs.writeFileSync(outPath, JSON.stringify([], null, 2));
  db.close();
  process.exit(0);
}

const placeholders = lines.map(() => '?').join(',');
const wordRows = db
  .prepare(
    `SELECT line_id, word_index, word
     FROM word_timestamps
     WHERE line_id IN (${placeholders})
     ORDER BY line_id, word_index`,
  )
  .all(...lines.map(l => l.id)) as { line_id: number; word_index: number; word: string }[];

const tokensByLine = new Map<number, [number, string][]>();
for (const w of wordRows) {
  let arr = tokensByLine.get(w.line_id);
  if (!arr) {
    arr = [];
    tokensByLine.set(w.line_id, arr);
  }
  arr.push([w.word_index, w.word]);
}

const out = lines
  .filter(l => tokensByLine.has(l.id) && tokensByLine.get(l.id)!.length > 0)
  .map(l => ({
    id: l.id,
    text: l.text,
    tokens: tokensByLine.get(l.id)!,
  }));

const skipped = lines.length - out.length;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(`Dumped ${out.length} untagged POC lines to ${outPath}`);
if (skipped > 0) console.log(`(${skipped} excluded: no word_timestamps)`);

db.close();
