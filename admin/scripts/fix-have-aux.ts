/**
 * Fix-up pass: any POC line where a "have/has/had/'ve/am/is/are/'m/'re/'s"
 * token is currently in REST but the next non-adverb token is a past-
 * participle or V-ing should be moved to AUX.
 *
 * This catches cases the initial splitter mis-tagged because its
 * past-participle list was incomplete (missing "got", "had", etc.).
 *
 * Run: cd admin && npx tsx scripts/fix-have-aux.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const ADVERBS = new Set([
  "not", "never", "always", "really", "very", "just", "still", "already",
  "only", "even", "actually", "definitely", "probably", "maybe", "barely",
  "totally", "literally", "honestly", "basically", "currently", "recently",
  "simply", "merely", "exactly", "absolutely", "kind", "sort", "usually",
  "often", "sometimes", "rarely", "almost", "nearly", "perfectly", "quite",
  "pretty", "rather", "ever",
]);
const IRREG_PP = new Set([
  "got","had","put","set","cut","hit","shut","let","fit","spit","bid",
  "been","gone","eaten","given","done","said","made","taken","written","broken",
  "fallen","found","gotten","sent","told","come","become","run","held","kept",
  "left","lost","meant","felt","thought","bought","brought","caught","taught",
  "spent","lent","bent","paid","laid","read","fed","led","bled","sped","fled",
  "spread","shed","wed","beat","beaten","ridden","hidden","forgotten","seen",
  "heard","slept","stood","won","sat","met","stuck","struck","drawn","known",
  "grown","shown","blown","thrown","flown","drunk","sunk","sung","swum","begun",
  "stolen","frozen","chosen","awoken","spoken","driven","torn","worn","born",
  "sworn","forgiven","split","quit","shot","forgot","cost","burst","arisen",
  "risen","bitten","rung","wrung","clung","spun","stung","swung","flung","slung",
  "stunk","shrunk","sold","resold","hung","dug","mistaken","retaken","undertaken",
  "withdrawn","withheld","withstood","overcome","overrun","overseen","overheard",
  "overtaken","understood","overlooked","redone","outdone","undone","saved",
  "supposed","needed",
]);

const TARGET_VERBS = new Set(["have","has","had","am","is","are","'ve","'m","'re","'s"]);

function strip(w: string): string {
  return w.replace(/^[^a-z']+|[^a-z']+$/gi, '').toLowerCase();
}
function isVing(w: string): boolean {
  const c = strip(w);
  return c.endsWith('ing') && c.length > 3;
}
function isPP(w: string): boolean {
  const c = strip(w);
  if (IRREG_PP.has(c)) return true;
  return c.endsWith('ed') && c.length > 2;
}

const lines = db
  .prepare(
    `SELECT sl.id, sl.structure
     FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id
     JOIN videos v ON v.id=c.video_id
     WHERE v.poc=1 AND c.status='approved'
       AND sl.structure IS NOT NULL`,
  )
  .all() as { id: number; structure: string }[];

const fetchTokens = db.prepare(
  `SELECT word_index, word FROM word_timestamps WHERE line_id = ? ORDER BY word_index`,
);
const updateStruct = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let scanned = 0;
let fixed = 0;
const samples: { id: number; old: string; new: string; text: string }[] = [];

for (const l of lines) {
  scanned++;
  const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
  const struct = JSON.parse(l.structure) as { subject: number[]; aux_verb: number[]; rest: number[] };
  const restSet = new Set(struct.rest);
  let changed = false;
  for (let i = 0; i < tokens.length; i++) {
    const c = strip(tokens[i].word);
    if (!TARGET_VERBS.has(c)) continue;
    if (!restSet.has(tokens[i].word_index)) continue; // already aux or subject
    // Look ahead for V-ing or past-part (skip adverbs)
    let auxLike = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const cn = strip(tokens[j].word);
      if (ADVERBS.has(cn)) continue;
      if (isVing(tokens[j].word) || isPP(tokens[j].word)) auxLike = true;
      break;
    }
    if (!auxLike) continue;
    // Move from rest to aux_verb
    struct.rest = struct.rest.filter(x => x !== tokens[i].word_index);
    struct.aux_verb.push(tokens[i].word_index);
    struct.aux_verb.sort((a, b) => a - b);
    changed = true;
  }
  if (changed) {
    fixed++;
    if (samples.length < 100) {
      const text = tokens.map(t => t.word).join(' ');
      samples.push({ id: l.id, old: l.structure, new: JSON.stringify(struct), text });
    }
    if (!DRY_RUN) updateStruct.run(JSON.stringify(struct), l.id);
  }
}

console.log(`Scanned ${scanned} POC lines.`);
console.log(`Fixed ${fixed} lines (be/have token moved to AUX).`);
console.log('\nSample fixes:');
for (const s of samples) {
  console.log(`  #${s.id}: ${s.text}`);
  console.log(`    old: ${s.old}`);
  console.log(`    new: ${s.new}`);
}

db.close();
