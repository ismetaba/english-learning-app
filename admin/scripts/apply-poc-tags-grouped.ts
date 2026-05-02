/**
 * Apply grouped sentence-structure tags to subtitle_lines.structure.
 *
 * Reads two files:
 *   --dump <path>     the dedup-grouped dump from dump-poc-untagged-deduped.ts
 *                     (each entry has lineIds[], text, tokens)
 *   --tags <path>     tag output written by the in-conversation tagger
 *                     (each entry has groupIdx, subject, aux_verb, rest)
 *
 * For each tagged group, validates the structure against the dump's tokens,
 * then fans the structure JSON out to every line_id in the group. Invalid
 * groups are skipped and reported.
 *
 * Run: cd admin && npx tsx scripts/apply-poc-tags-grouped.ts --dump batch.json --tags tags.json
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

type DumpEntry = { lineIds: number[]; text: string; tokens: [number, string][] };
type TagEntry = { groupIdx: number; subject: number[]; aux_verb: number[]; rest: number[] };

const args = process.argv.slice(2);
const dumpIdx = args.indexOf('--dump');
const tagsIdx = args.indexOf('--tags');
const dumpPath = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
const tagsPath = tagsIdx >= 0 ? args[tagsIdx + 1] : null;

if (!dumpPath || !tagsPath) {
  console.error('Usage: --dump <dumpPath> --tags <tagsPath>');
  process.exit(1);
}
if (!fs.existsSync(dumpPath) || !fs.existsSync(tagsPath)) {
  console.error('Input file(s) not found');
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8')) as DumpEntry[];
const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf8')) as TagEntry[];

console.log(`Apply grouped tags`);
console.log('---');
console.log(`Dump groups: ${dump.length}`);
console.log(`Tag entries: ${tags.length}`);

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const update = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let appliedGroups = 0;
let appliedLines = 0;
let rejectedGroups = 0;
const rejections: { groupIdx: number; reason: string }[] = [];

const tx = db.transaction(() => {
  for (const t of tags) {
    const g = dump[t.groupIdx];
    if (!g) {
      rejectedGroups++;
      rejections.push({ groupIdx: t.groupIdx, reason: 'no matching dump group' });
      continue;
    }
    if (!Array.isArray(t.subject) || !Array.isArray(t.aux_verb) || !Array.isArray(t.rest)) {
      rejectedGroups++;
      rejections.push({ groupIdx: t.groupIdx, reason: 'subject/aux_verb/rest must all be arrays' });
      continue;
    }
    const expected = new Set(g.tokens.map(([i]) => i));
    const all = [...t.subject, ...t.aux_verb, ...t.rest];
    const allInRange = all.every(i => expected.has(i));
    const noDupes = new Set(all).size === all.length;
    const fullCover = all.length === expected.size;
    if (!allInRange || !noDupes || !fullCover) {
      rejectedGroups++;
      rejections.push({
        groupIdx: t.groupIdx,
        reason: `in_range=${allInRange} no_dupes=${noDupes} full_cover=${fullCover} (got ${all.length}/${expected.size}) text=${JSON.stringify(g.text)}`,
      });
      continue;
    }
    const json = JSON.stringify({ subject: t.subject, aux_verb: t.aux_verb, rest: t.rest });
    for (const lineId of g.lineIds) {
      update.run(json, lineId);
      appliedLines++;
    }
    appliedGroups++;
  }
});
tx();

console.log(`\nApplied ${appliedGroups} groups → ${appliedLines} lines updated.`);
console.log(`Rejected groups: ${rejectedGroups}`);
if (rejections.length > 0) {
  console.log('\nRejections:');
  for (const r of rejections.slice(0, 25)) console.log(`  group #${r.groupIdx}: ${r.reason}`);
  if (rejections.length > 25) console.log(`  ... and ${rejections.length - 25} more`);
}

const cov = db
  .prepare(
    `SELECT
       SUM(CASE WHEN sl.structure IS NOT NULL THEN 1 ELSE 0 END) AS tagged,
       COUNT(*) AS total
     FROM subtitle_lines sl
     JOIN clips c ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1 AND c.status = 'approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0`,
  )
  .get() as { tagged: number; total: number };
console.log(
  `\nPOC structure coverage: ${cov.tagged.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.tagged) / cov.total).toFixed(1)}%)`,
);

db.close();
