/**
 * Audit POC sentence-structure tags. Flags rule violations:
 *   1. be-verb (am/is/are/was/were/being/been) tagged AUX when followed by
 *      a non-V-ing/non-past-part token, or REST when followed by V-ing/past-part.
 *   2. have/has/had tagged AUX when followed by a non-past-part, or REST
 *      when clearly followed by past-part.
 *   3. Modals (can/could/will/would/should/may/might/must/shall) tagged
 *      REST when there's a main verb after.
 *   4. Subject pronouns (I/you/he/she/it/we/they) tagged REST.
 *   5. Subject contractions (I'm/you're/he's/she's/it's/we're/they're/that's)
 *      tagged REST.
 *
 * Outputs lines per category, with old structure JSON. Pure read; no writes.
 *
 * Run: cd admin && npx tsx scripts/audit-poc-tags.ts [--limit N] [--category be|have|modal|subject|all]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '50', 10) : 50;
const catIdx = args.indexOf('--category');
const CATEGORY = catIdx >= 0 ? args[catIdx + 1] : 'all';

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ─── Heuristics ────────────────────────────────────────────────────────────
const ADVERBS = new Set([
  "not", "never", "always", "really", "very", "just", "still", "already",
  "only", "even", "actually", "definitely", "probably", "maybe", "barely",
  "totally", "literally", "honestly", "basically", "currently", "recently",
  "simply", "merely", "exactly", "absolutely", "kind", "sort", "usually",
  "often", "sometimes", "rarely", "almost", "nearly", "perfectly", "quite",
  "pretty", "rather", "ever",
]);

// True past-participles only (exclude -ed adjectives that confuse the heuristic).
// Conservative list — only flag clear past-part forms.
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
  "shrunk","sold","hung","dug",
]);

// -ing words that are NOT V-ing — they're nouns/adjectives/pronouns.
const ING_NOT_VING = new Set([
  "nothing","something","anything","everything","king","ring","string","thing",
  "morning","evening","ceiling","spring","sing","wing","sting","feeling",
  "meeting","ending","beginning","painting","drawing","wedding","building",
  "amazing","interesting","exciting","boring","missing","willing","loving",
]);

const BE_FORMS = new Set(["am","is","are","was","were","being","been","'m","'re","'s"]);
const HAVE_FORMS = new Set(["have","has","had","'ve"]);
const MODALS = new Set(["can","could","will","would","should","may","might","must","shall","'ll","'d"]);
const SUBJECT_PRONOUNS = new Set([
  "i","you","he","she","it","we","they","this","that","these","those",
]);
const SUBJECT_CONTRACTIONS = new Set([
  "i'm","you're","he's","she's","it's","we're","they're","that's","there's",
  "here's","what's","i'll","you'll","he'll","she'll","it'll","we'll","they'll",
  "i've","you've","we've","they've","i'd","you'd","he'd","she'd","we'd","they'd",
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
  const c = strip(w);
  return RELIABLE_PAST_PARTS.has(c);
}

// ─── Pull tokens for all POC lines ────────────────────────────────────────
const lines = db
  .prepare(
    `SELECT sl.id, sl.text, sl.structure
     FROM subtitle_lines sl
     JOIN clips c ON c.id=sl.clip_id
     JOIN videos v ON v.id=c.video_id
     WHERE v.poc=1 AND c.status='approved'
       AND sl.structure IS NOT NULL`,
  )
  .all() as { id: number; text: string; structure: string }[];

const fetchTokens = db.prepare(
  `SELECT word_index, word FROM word_timestamps WHERE line_id = ? ORDER BY word_index`,
);

interface Issue {
  id: number;
  text: string;
  category: string;
  detail: string;
}

const issues: Record<string, Issue[]> = {
  be_should_aux: [],
  be_should_rest: [],
  have_should_aux: [],
  modal_should_aux: [],
  pronoun_should_subject: [],
  contraction_should_subject: [],
};

function lookupBucket(struct: { subject: number[]; aux_verb: number[]; rest: number[] }, idx: number): string {
  if (struct.subject.includes(idx)) return 'subject';
  if (struct.aux_verb.includes(idx)) return 'aux_verb';
  return 'rest';
}

function nextNonAdverb(tokens: { word_index: number; word: string }[], from: number): { word: string; idx: number } | null {
  for (let j = from; j < tokens.length; j++) {
    if (ADVERBS.has(strip(tokens[j].word))) continue;
    return { word: tokens[j].word, idx: tokens[j].word_index };
  }
  return null;
}

/** For be-verbs in question-inversion ("Are you running?"), the V-ing
 *  is past the subject pronoun. This walks past adverbs AND a single
 *  pronoun/noun-phrase to find the real predicate. */
function questionPredicate(tokens: { word_index: number; word: string }[], from: number): { word: string } | null {
  let crossedSubject = false;
  for (let j = from; j < tokens.length; j++) {
    const c = strip(tokens[j].word);
    if (ADVERBS.has(c)) continue;
    if (!crossedSubject && SUBJECT_PRONOUNS.has(c)) {
      crossedSubject = true;
      continue;
    }
    return { word: tokens[j].word };
  }
  return null;
}

let scanned = 0;
for (const l of lines) {
  scanned++;
  const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
  if (tokens.length === 0) continue;
  const struct = JSON.parse(l.structure) as { subject: number[]; aux_verb: number[]; rest: number[] };

  for (let i = 0; i < tokens.length; i++) {
    const c = strip(tokens[i].word);
    const bucket = lookupBucket(struct, tokens[i].word_index);
    const isFirstWord = i === 0;
    const next = nextNonAdverb(tokens, i + 1);

    // 1. be-form check (handles question-inversion by looking past subject)
    if (BE_FORMS.has(c)) {
      const isFirst = i === 0 || (i > 0 && /^[A-Z]/.test(tokens[i].word));
      // Try direct lookup first; if next is a subject pronoun, also try past it
      const direct = next;
      const inverted = questionPredicate(tokens, i + 1);
      const directVing = direct ? isVing(direct.word) : false;
      const directPP = direct ? isPP(direct.word) : false;
      const invertedVing = inverted ? isVing(inverted.word) : false;
      const invertedPP = inverted ? isPP(inverted.word) : false;
      const auxJustified = directVing || directPP || invertedVing || invertedPP;

      if (auxJustified && bucket !== 'aux_verb') {
        issues.be_should_aux.push({
          id: l.id,
          text: l.text,
          category: 'be_should_aux',
          detail: `"${tokens[i].word}" tagged ${bucket} but predicate is "${(invertedVing||invertedPP) ? inverted?.word : direct?.word}" (V-ing/PP)`,
        });
      } else if (direct && !auxJustified && bucket === 'aux_verb') {
        issues.be_should_rest.push({
          id: l.id,
          text: l.text,
          category: 'be_should_rest',
          detail: `"${tokens[i].word}" tagged AUX but next predicate is "${inverted?.word ?? direct?.word}" (not V-ing/PP)`,
        });
      }
    }

    // 2. have-form check (only flag clear past-part case)
    if (HAVE_FORMS.has(c)) {
      const followsPP = next ? isPP(next.word) : false;
      if (followsPP && bucket !== 'aux_verb') {
        issues.have_should_aux.push({
          id: l.id,
          text: l.text,
          category: 'have_should_aux',
          detail: `"${tokens[i].word}" tagged ${bucket} but next is "${next?.word}" (past-part)`,
        });
      }
    }

    // 3. Modal check
    if (MODALS.has(c) && bucket !== 'aux_verb') {
      // Skip pro-form usage where modal stands alone (no main verb after)
      if (next) {
        issues.modal_should_aux.push({
          id: l.id,
          text: l.text,
          category: 'modal_should_aux',
          detail: `modal "${tokens[i].word}" tagged ${bucket} but next is "${next.word}"`,
        });
      }
    }

    // 4. Subject pronoun check (only flag if it's clearly the doer — heuristic: at sentence start or after comma/conjunction)
    if (SUBJECT_PRONOUNS.has(c) && bucket === 'rest') {
      // Heuristic: pronoun followed by a verb or aux is a subject
      const nextWord = next?.word ? strip(next.word) : '';
      const nextIsVerb = next && (isVing(next.word) || isPP(next.word) ||
        BE_FORMS.has(nextWord) || HAVE_FORMS.has(nextWord) || MODALS.has(nextWord) ||
        nextWord.endsWith('ed') || ['like','love','want','need','know','think','make','take','get','go','come','see','hear','say','said','feel','look','find','give','tell','keep','leave','meet','let','put','run','call','do','does','did','don\'t','doesn\'t','didn\'t'].includes(nextWord));
      if (nextIsVerb) {
        issues.pronoun_should_subject.push({
          id: l.id,
          text: l.text,
          category: 'pronoun_should_subject',
          detail: `pronoun "${tokens[i].word}" tagged REST, next "${next?.word}" looks like verb`,
        });
      }
    }

    // 5. Subject contraction in REST
    if (SUBJECT_CONTRACTIONS.has(c) && bucket === 'rest') {
      issues.contraction_should_subject.push({
        id: l.id,
        text: l.text,
        category: 'contraction_should_subject',
        detail: `contraction "${tokens[i].word}" tagged REST`,
      });
    }
  }
}

console.log(`Scanned ${scanned.toLocaleString()} POC lines`);
console.log('---');
for (const [cat, items] of Object.entries(issues)) {
  console.log(`\n${cat}: ${items.length} potential issues`);
  if (CATEGORY !== 'all' && cat !== CATEGORY) continue;
  for (const it of items.slice(0, LIMIT)) {
    console.log(`  #${it.id}: ${it.text}`);
    console.log(`    ${it.detail}`);
  }
  if (items.length > LIMIT) {
    console.log(`  ... and ${items.length - LIMIT} more`);
  }
}

db.close();
