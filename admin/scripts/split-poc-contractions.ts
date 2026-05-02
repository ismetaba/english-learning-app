/**
 * Split pronoun+verb contractions in POC word_timestamps into two tokens
 * with context-aware structure tags.
 *
 * Why: the contraction "That's" was tagged as a single SUBJECT token. iOS
 * then visually expanded it to "That is" and unconditionally colored the
 * verb half as AUX. That's wrong for be+predicate ("That is what...") —
 * "is" is REST there, not AUX.
 *
 * This script splits the contraction at the DB level so each half gets
 * its own bucket. iOS won't trigger contraction expansion (token "is"
 * isn't a known contraction key) and renders each token with its
 * own color.
 *
 * Splits applied:
 *   pronoun + be ('m, 're, 's)        → first=SUBJECT, second=AUX if next non-adverb is V-ing/past-part else REST
 *   pronoun + modal ('ll, 'd)         → first=SUBJECT, second=AUX (modal always aux)
 *   pronoun + perfect-have ('ve)      → first=SUBJECT, second=AUX (have+past-part)
 *   let's                             → first=REST, second=REST (hortative imperative)
 *
 * Aux+negation contractions (don't, can't, isn't, etc.) are NOT split — they
 * already sit in a single AUX bucket and iOS doesn't touch them.
 *
 * Run: cd admin && npx tsx scripts/split-poc-contractions.ts [--dry-run] [--limit N]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) : 0;

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Contraction maps ──────────────────────────────────────────────────────
// Lowercased core (no trailing punctuation) → [first, second, secondKind]
// secondKind drives bucket assignment for the second half.
type SecondKind = 'be' | 'modal' | 'have' | 'lets';
const PRONOUN_VERB: Record<string, [string, string, SecondKind]> = {
  "i'm":     ["I", "am", "be"],
  "you're":  ["you", "are", "be"],
  "he's":    ["he", "is", "be"],
  "she's":   ["she", "is", "be"],
  "it's":    ["it", "is", "be"],
  "we're":   ["we", "are", "be"],
  "they're": ["they", "are", "be"],
  "that's":  ["that", "is", "be"],
  "there's": ["there", "is", "be"],
  "here's":  ["here", "is", "be"],
  "what's":  ["what", "is", "be"],
  "where's": ["where", "is", "be"],
  "who's":   ["who", "is", "be"],
  "how's":   ["how", "is", "be"],
  "when's":  ["when", "is", "be"],
  "one's":   ["one", "is", "be"],
  "i'll":    ["I", "will", "modal"],
  "you'll":  ["you", "will", "modal"],
  "he'll":   ["he", "will", "modal"],
  "she'll":  ["she", "will", "modal"],
  "it'll":   ["it", "will", "modal"],
  "we'll":   ["we", "will", "modal"],
  "they'll": ["they", "will", "modal"],
  "that'll": ["that", "will", "modal"],
  "i've":    ["I", "have", "have"],
  "you've":  ["you", "have", "have"],
  "we've":   ["we", "have", "have"],
  "they've": ["they", "have", "have"],
  "who've":  ["who", "have", "have"],
  "i'd":     ["I", "would", "modal"],
  "you'd":   ["you", "would", "modal"],
  "he'd":    ["he", "would", "modal"],
  "she'd":   ["she", "would", "modal"],
  "we'd":    ["we", "would", "modal"],
  "they'd":  ["they", "would", "modal"],
  "that'd":  ["that", "would", "modal"],
  "let's":   ["let", "us", "lets"],
};

const ADVERBS = new Set([
  "not", "never", "always", "really", "very", "just", "still", "already",
  "only", "even", "actually", "definitely", "probably", "maybe", "barely",
  "totally", "literally", "honestly", "basically", "currently", "recently",
  "simply", "merely", "exactly", "absolutely", "kind", "sort", "usually",
  "often", "sometimes", "rarely", "almost", "nearly", "perfectly", "quite",
  "pretty", "rather", "ever",
]);

const IRREGULAR_PAST_PARTICIPLES = new Set([
  // Forms identical to base/past — easy to miss
  "got","had","put","set","cut","hit","shut","let","fit","spit","bid",
  // Common irregulars
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
  "shown","told","worn","lost","made","done","gotten","needed","supposed",
]);

function stripPunct(w: string): string {
  return w.replace(/^[^a-z']+|[^a-z']+$/gi, '').toLowerCase();
}

function isVing(w: string): boolean {
  const c = stripPunct(w);
  return c.endsWith('ing') && c.length > 3;
}

function isPastPart(w: string): boolean {
  const c = stripPunct(w);
  if (IRREGULAR_PAST_PARTICIPLES.has(c)) return true;
  // Regular -ed verbs. Heuristic — if it ends in -ed and isn't a typical
  // past-tense usage, treat it as past participle for be+ context.
  return c.endsWith('ed') && c.length > 2;
}

type Bucket = 'subject' | 'aux_verb' | 'rest';

/** Decide bucket for the second half of a be-contraction by peeking at
 *  the next non-adverb token. */
function beSecondBucket(rawTokens: string[], afterIdx: number): Bucket {
  for (let i = afterIdx; i < rawTokens.length; i++) {
    const c = stripPunct(rawTokens[i]);
    if (ADVERBS.has(c)) continue;
    if (isVing(rawTokens[i]) || isPastPart(rawTokens[i])) return 'aux_verb';
    return 'rest';
  }
  return 'rest';
}

// ─── 1. Pull every POC line that has at least one contraction token ────────
const candidates = db
  .prepare(
    `SELECT sl.id AS line_id, sl.structure
     FROM subtitle_lines sl
     JOIN clips c  ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND sl.text IS NOT NULL AND length(trim(sl.text)) > 0
       AND EXISTS (
         SELECT 1 FROM word_timestamps wt
         WHERE wt.line_id = sl.id
           AND lower(wt.word) GLOB '*''*'
       )
     ORDER BY sl.id
     ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}`,
  )
  .all() as { line_id: number; structure: string | null }[];

console.log(`Split contractions in POC word_timestamps`);
console.log('---');
console.log(`Lines with at least one apostrophe token: ${candidates.length.toLocaleString()}`);
if (candidates.length === 0) {
  db.close();
  process.exit(0);
}

// ─── 2. Process each line ──────────────────────────────────────────────────
const fetchTokens = db.prepare(
  `SELECT word_index, word, start_time, end_time, starter_word_id
     FROM word_timestamps
     WHERE line_id = ?
     ORDER BY word_index`,
);
const deleteTokens = db.prepare(`DELETE FROM word_timestamps WHERE line_id = ?`);
const insertToken = db.prepare(
  `INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time, starter_word_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const updateLine = db.prepare(
  `UPDATE subtitle_lines SET structure = ?, text = ? WHERE id = ?`,
);
const fetchLine = db.prepare(`SELECT text FROM subtitle_lines WHERE id = ?`);

interface OldToken {
  word_index: number;
  word: string;
  start_time: number;
  end_time: number;
  starter_word_id: string | null;
}

interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

function parseStructure(raw: string | null): Structure | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (Array.isArray(o.subject) && Array.isArray(o.aux_verb) && Array.isArray(o.rest)) {
      return o;
    }
    return null;
  } catch {
    return null;
  }
}

function bucketOfOldIdx(structure: Structure | null, idx: number): Bucket {
  if (!structure) return 'rest';
  if (structure.subject.includes(idx)) return 'subject';
  if (structure.aux_verb.includes(idx)) return 'aux_verb';
  return 'rest';
}

function preserveCase(template: string, expanded: string): string {
  // Match the original case of the contraction's first character, e.g.
  // "That" → "That", "she" → "she", "I" stays uppercase, etc.
  if (!template || !expanded) return expanded;
  const first = template[0];
  if (!first) return expanded;
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return expanded.charAt(0).toUpperCase() + expanded.slice(1);
  }
  return expanded;
}

function preserveTrailingPunct(originalToken: string, replacement: string): string {
  const m = originalToken.match(/[^a-zA-Z']+$/);
  if (!m) return replacement;
  return replacement + m[0];
}

let processed = 0;
let split = 0;
let textsRewritten = 0;
const skippedReason: Record<string, number> = {};

const tx = db.transaction(() => {
  for (const c of candidates) {
    const tokens = fetchTokens.all(c.line_id) as OldToken[];
    if (tokens.length === 0) {
      skippedReason['no_tokens'] = (skippedReason['no_tokens'] ?? 0) + 1;
      continue;
    }
    const oldStructure = parseStructure(c.structure);
    const rawTokens = tokens.map(t => t.word);

    // Build new token list
    interface NewToken {
      word: string;
      start_time: number;
      end_time: number;
      starter_word_id: string | null;
      bucket: Bucket;
    }
    const newTokens: NewToken[] = [];
    let didSplit = false;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const core = stripPunct(t.word);
      const map = PRONOUN_VERB[core];
      const oldBucket = bucketOfOldIdx(oldStructure, t.word_index);

      if (!map) {
        newTokens.push({
          word: t.word,
          start_time: t.start_time,
          end_time: t.end_time,
          starter_word_id: t.starter_word_id,
          bucket: oldBucket,
        });
        continue;
      }

      didSplit = true;
      const [firstRaw, secondRaw, kind] = map;
      const firstWord = preserveCase(t.word, firstRaw);
      const secondWord = preserveTrailingPunct(t.word, secondRaw);

      // Time split — give first half ~half the duration.
      const mid = (t.start_time + t.end_time) / 2;

      // Bucket assignment
      let firstBucket: Bucket;
      let secondBucket: Bucket;
      if (kind === 'lets') {
        // "Let's go" — both REST in our scheme (hortative imperative).
        firstBucket = 'rest';
        secondBucket = 'rest';
      } else {
        firstBucket = oldBucket; // pronoun keeps original bucket
        if (kind === 'modal') {
          secondBucket = 'aux_verb';
        } else if (kind === 'have') {
          // Look ahead for past-participle.
          secondBucket = beSecondBucket(rawTokens, i + 1);
        } else {
          // be: same lookahead.
          secondBucket = beSecondBucket(rawTokens, i + 1);
        }
      }

      newTokens.push({
        word: firstWord,
        start_time: t.start_time,
        end_time: mid,
        starter_word_id: t.starter_word_id, // keep starter on the pronoun half
        bucket: firstBucket,
      });
      newTokens.push({
        word: secondWord,
        start_time: mid,
        end_time: t.end_time,
        starter_word_id: null,
        bucket: secondBucket,
      });
    }

    if (!didSplit) {
      skippedReason['no_contraction_match'] = (skippedReason['no_contraction_match'] ?? 0) + 1;
      continue;
    }

    // Build new structure JSON from new tokens' buckets
    const newStructure: Structure = { subject: [], aux_verb: [], rest: [] };
    for (let i = 0; i < newTokens.length; i++) {
      newStructure[newTokens[i].bucket].push(i);
    }

    // Build the new text by joining new tokens with spaces (preserves
    // punctuation since each token still has its own).
    const newText = newTokens.map(n => n.word).join(' ');
    const oldText = (fetchLine.get(c.line_id) as { text: string }).text;
    const textChanged = newText !== oldText;

    if (DRY_RUN) {
      processed++;
      split++;
      if (textChanged) textsRewritten++;
      continue;
    }

    deleteTokens.run(c.line_id);
    for (let i = 0; i < newTokens.length; i++) {
      const n = newTokens[i];
      insertToken.run(
        c.line_id,
        i,
        n.word,
        n.start_time,
        n.end_time,
        n.starter_word_id,
      );
    }
    updateLine.run(JSON.stringify(newStructure), newText, c.line_id);
    if (textChanged) textsRewritten++;
    processed++;
    split++;
  }
});
tx();

console.log(`\nProcessed ${processed.toLocaleString()} lines.`);
console.log(`Split ${split.toLocaleString()} lines (text rewritten on ${textsRewritten.toLocaleString()}).`);
if (Object.keys(skippedReason).length > 0) {
  console.log('Skipped reasons:');
  for (const [k, v] of Object.entries(skippedReason)) console.log(`  ${k}: ${v}`);
}

// Sanity check: count POC tokens that still match a pronoun+verb contraction key
const remaining = db
  .prepare(
    `SELECT wt.word
     FROM word_timestamps wt
     JOIN subtitle_lines sl ON sl.id = wt.line_id
     JOIN clips c ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND lower(wt.word) LIKE '%''%'`,
  )
  .all() as { word: string }[];
const stillContraction = remaining.filter(r => PRONOUN_VERB[stripPunct(r.word)] !== undefined).length;
console.log(`\nRemaining unsplit pronoun+verb contractions in POC: ${stillContraction}`);

db.close();
