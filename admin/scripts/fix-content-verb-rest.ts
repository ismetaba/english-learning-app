/**
 * Move content verbs out of the AUX bucket. The original 15-POC tagging
 * (commit d38a508) used a looser scheme where "all verbs" landed in V/AUX,
 * but our actual rule is much stricter: AUX ONLY for be-forms (followed by
 * V-ing/PP), have-perfect, modals, and do-forms (in questions/negation).
 *
 * Anything else in AUX is a content verb and belongs in REST.
 *
 * Strategy: scan each POC line's aux_verb list. For each token whose
 * normalized form is NOT in the LEGIT_AUX whitelist, move it to REST.
 *
 * Run: cd admin && npx tsx scripts/fix-content-verb-rest.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Tokens that may legitimately appear in AUX. Anything else is a content
// verb (or noise) and belongs in REST.
const LEGIT_AUX = new Set([
  // be-forms
  "am","is","are","was","were","being","been",
  // contraction-second-halves (post-split)
  "'m","'re","'s","'ve","'ll","'d",
  // have-forms
  "have","has","had",
  // modals
  "will","would","can","could","may","might","must","shall","should",
  // do-forms
  "do","does","did",
  // aux+negation contractions (kept as one token by design)
  "don't","doesn't","didn't","won't","wouldn't","can't","couldn't",
  "shouldn't","shan't","mustn't","mayn't","mightn't",
  "isn't","wasn't","aren't","weren't",
  "haven't","hasn't","hadn't",
  // dare, need, ought, used (semi-modals, occasionally aux-like)
  "dare","ought","used","need",
]);

function strip(w: string): string {
  return w.replace(/^[^a-z']+|[^a-z']+$/gi, '').toLowerCase();
}

const lines = db
  .prepare(
    `SELECT sl.id, sl.structure FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id JOIN videos v ON v.id=c.video_id
     WHERE v.poc=1 AND c.status='approved' AND sl.structure IS NOT NULL`,
  )
  .all() as { id: number; structure: string }[];

const fetchTokens = db.prepare(
  `SELECT word_index, word FROM word_timestamps WHERE line_id = ? ORDER BY word_index`,
);
const updateStruct = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let scanned = 0;
let fixed = 0;
let movedTokens = 0;
const wordCounts: Record<string, number> = {};
const samples: { id: number; text: string; old: string; nw: string }[] = [];

const tx = db.transaction(() => {
  for (const l of lines) {
    scanned++;
    const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
    if (tokens.length === 0) continue;
    const struct = JSON.parse(l.structure) as { subject: number[]; aux_verb: number[]; rest: number[] };
    const tokenByIdx = new Map(tokens.map(t => [t.word_index, t.word]));
    let changed = false;
    const newAux: number[] = [];
    for (const idx of struct.aux_verb) {
      const word = tokenByIdx.get(idx);
      if (!word) {
        newAux.push(idx);
        continue;
      }
      const c = strip(word);
      if (LEGIT_AUX.has(c)) {
        newAux.push(idx);
        continue;
      }
      // Move to rest
      struct.rest.push(idx);
      wordCounts[c] = (wordCounts[c] ?? 0) + 1;
      movedTokens++;
      changed = true;
    }
    if (changed) {
      struct.aux_verb = newAux;
      struct.rest.sort((a, b) => a - b);
      fixed++;
      if (samples.length < 8) {
        samples.push({
          id: l.id,
          text: tokens.map(t => t.word).join(' '),
          old: l.structure,
          nw: JSON.stringify(struct),
        });
      }
      if (!DRY_RUN) updateStruct.run(JSON.stringify(struct), l.id);
    }
  }
});
tx();

console.log(`Scanned ${scanned.toLocaleString()} POC lines.`);
console.log(`Fixed ${fixed.toLocaleString()} lines, moved ${movedTokens.toLocaleString()} content-verb tokens out of AUX.`);
console.log('\nTop moved word forms:');
const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [w, n] of sorted) console.log(`  ${w.padEnd(15)} ${n.toLocaleString()}`);
console.log('\nSample fixes:');
for (const s of samples) {
  console.log(`  #${s.id}: ${s.text}`);
  console.log(`    old: ${s.old}`);
  console.log(`    new: ${s.nw}`);
}

db.close();
