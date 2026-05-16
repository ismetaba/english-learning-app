/**
 * Post-pass that adds missing SUBJECT + AUX_VERB indices to existing
 * structure JSONs for compound sentences like:
 *   "You are alone, and you are scared, ..."
 *   "I am tired and I'm sleepy"
 *   "This is great, you're amazing"
 * The rule-based tagger only marks the first subject + verb chunk; this
 * script scans for additional pronoun+BE pairs (or subject_contractions
 * like "I'm", "you're", "he's") inside the rest of the sentence and
 * promotes them so the karaoke colors stay consistent across all
 * subject-aux pairs.
 *
 * Run: cd admin && npx tsx scripts/fix-secondary-subjects.ts [--dry-run]
 *
 * Conservative: only fires when the token is a clear nominative pronoun
 * directly followed by a BE form, OR is a subject_contraction itself.
 * Object pronouns ("me"/"him") and stray "is/are" not preceded by a
 * pronoun are left alone.
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const DB_PATH = process.env.DATABASE_PATH ?? path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const NOMINATIVE_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were']);
// Subject+aux contractions — the single token IS both subject and aux.
const SUBJECT_CONTRACTIONS = new Set([
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "that's", "there's", "here's", "what's",
]);

function clean(w: string): string {
  return w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
}

interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

const lines = db
  .prepare(
    `SELECT sl.id, sl.structure FROM subtitle_lines sl
     WHERE sl.structure IS NOT NULL`,
  )
  .all() as { id: number; structure: string }[];

console.log(`Lines with structure: ${lines.length.toLocaleString()}`);

const fetchWords = db.prepare(
  `SELECT word_index, word FROM word_timestamps WHERE line_id = ? ORDER BY word_index`,
);
const updateStruct = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);

let updated = 0;
let scanned = 0;
const start = Date.now();

const tx = db.transaction(() => {
  for (const l of lines) {
    scanned++;
    let s: Structure;
    try { s = JSON.parse(l.structure); } catch { continue; }
    if (!Array.isArray(s.subject) || !Array.isArray(s.aux_verb) || !Array.isArray(s.rest)) continue;

    const tokens = fetchWords.all(l.id) as { word_index: number; word: string }[];
    if (tokens.length === 0) continue;

    const subjectSet = new Set(s.subject);
    const auxSet     = new Set(s.aux_verb);

    let touched = false;

    for (let i = 0; i < tokens.length; i++) {
      const idx = tokens[i].word_index;
      const c = clean(tokens[i].word);
      if (!c) continue;

      // 1. Standalone subject contraction — single token covers both roles.
      if (SUBJECT_CONTRACTIONS.has(c)) {
        if (!subjectSet.has(idx)) { subjectSet.add(idx); touched = true; }
        if (!auxSet.has(idx))     { auxSet.add(idx);     touched = true; }
        continue;
      }

      // 2. Nominative pronoun followed by a BE form (in the next token).
      if (NOMINATIVE_PRONOUNS.has(c) && i + 1 < tokens.length) {
        const nextIdx = tokens[i + 1].word_index;
        const nc = clean(tokens[i + 1].word);
        if (BE_FORMS.has(nc)) {
          if (!subjectSet.has(idx))     { subjectSet.add(idx);     touched = true; }
          if (!auxSet.has(nextIdx))     { auxSet.add(nextIdx);     touched = true; }
        }
      }
    }

    if (!touched) continue;

    // Rebuild rest = all indices not in subject/aux_verb.
    const allIdx = tokens.map(t => t.word_index);
    const newSubject = [...subjectSet].sort((a, b) => a - b);
    const newAux     = [...auxSet].sort((a, b) => a - b);
    const newRest    = allIdx.filter(i => !subjectSet.has(i) && !auxSet.has(i)).sort((a, b) => a - b);

    const newStruct = JSON.stringify({
      subject:  newSubject,
      aux_verb: newAux,
      rest:     newRest,
    });

    if (!DRY_RUN) updateStruct.run(newStruct, l.id);
    updated++;
  }
});
tx();

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`Scanned ${scanned.toLocaleString()} lines, updated ${updated.toLocaleString()} in ${elapsed}s.`);
db.close();
