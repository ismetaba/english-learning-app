/**
 * Move be-verbs from REST to AUX when followed (possibly past a single
 * subject pronoun, for question inversion) by V-ing or past-participle.
 *
 * E.g. "How is that going?" — "is" should be AUX because past the subject
 * "that" comes "going" (V-ing).
 *
 * Run: cd admin && npx tsx scripts/fix-be-aux.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const ADVERBS = new Set([
  "not","never","always","really","very","just","still","already","only",
  "even","actually","definitely","probably","maybe","barely","totally",
  "literally","honestly","basically","currently","recently","simply","merely",
  "exactly","absolutely","kind","sort","usually","often","sometimes","rarely",
  "almost","nearly","perfectly","quite","pretty","rather","ever","seriously",
]);
const RELIABLE_PAST_PARTS = new Set([
  "been","gone","eaten","given","done","said","made","taken","written","broken",
  "fallen","found","gotten","got","sent","told","come","become","run","held",
  "kept","left","lost","meant","felt","thought","bought","brought","caught",
  "taught","spent","lent","bent","paid","laid","fed","led","bled","sped","fled",
  "spread","beaten","ridden","hidden","forgotten","seen","heard","slept","stood",
  "won","sat","met","stuck","struck","drawn","known","grown","shown","blown",
  "thrown","flown","drunk","sunk","sung","swum","begun","stolen","frozen",
  "chosen","awoken","spoken","driven","torn","worn","born","sworn","forgiven",
  "split","quit","shot","forgot","cost","burst","arisen","risen","bitten",
  "rung","wrung","clung","spun","stung","swung","flung","slung","stunk",
  "shrunk","sold","hung","dug","supposed","required","involved","based","needed",
]);
const ING_NOT_VING = new Set([
  "nothing","something","anything","everything","king","ring","string","thing",
  "morning","evening","ceiling","spring","sing","wing","sting","feeling",
  "meeting","ending","beginning","painting","drawing","wedding","building",
  "amazing","interesting","exciting","boring","missing","willing","loving",
  "darling","sibling","earring","pudding",
]);
const BE_FORMS = new Set(["am","is","are","was","were","being","been","'m","'re","'s"]);
const SUBJECT_TOKENS = new Set([
  "i","you","he","she","it","we","they","this","that","these","those",
]);

function strip(w: string): string {
  return w.replace(/^[^a-z']+|[^a-z']+$/gi, '').toLowerCase();
}
function isVing(w: string): boolean {
  const c = strip(w);
  if (ING_NOT_VING.has(c)) return false;
  return c.endsWith('ing') && c.length > 3;
}
function isPP(w: string): boolean {
  return RELIABLE_PAST_PARTS.has(strip(w));
}

function shouldBeAux(tokens: { word_index: number; word: string }[], i: number): boolean {
  let crossedSubject = false;
  for (let j = i + 1; j < tokens.length; j++) {
    const c = strip(tokens[j].word);
    if (ADVERBS.has(c)) continue;
    if (!crossedSubject && SUBJECT_TOKENS.has(c)) {
      crossedSubject = true;
      continue;
    }
    return isVing(tokens[j].word) || isPP(tokens[j].word);
  }
  return false;
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
const samples: { id: number; text: string; old: string; nw: string }[] = [];

const tx = db.transaction(() => {
  for (const l of lines) {
    scanned++;
    const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
    if (tokens.length === 0) continue;
    const struct = JSON.parse(l.structure) as { subject: number[]; aux_verb: number[]; rest: number[] };
    const restSet = new Set(struct.rest);
    let changed = false;
    for (let i = 0; i < tokens.length; i++) {
      const c = strip(tokens[i].word);
      if (!BE_FORMS.has(c)) continue;
      if (!restSet.has(tokens[i].word_index)) continue; // not in REST
      if (!shouldBeAux(tokens, i)) continue;
      // Move from rest to aux_verb
      struct.rest = struct.rest.filter(x => x !== tokens[i].word_index);
      struct.aux_verb.push(tokens[i].word_index);
      struct.aux_verb.sort((a, b) => a - b);
      changed = true;
    }
    if (changed) {
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
console.log(`Moved be-verb REST→AUX on ${fixed.toLocaleString()} lines.`);
console.log('\nSample fixes:');
for (const s of samples) {
  console.log(`  #${s.id}: ${s.text}`);
  console.log(`    old: ${s.old}`);
  console.log(`    new: ${s.nw}`);
}

db.close();
