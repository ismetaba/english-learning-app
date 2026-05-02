/**
 * Pure rule-based sentence-structure tagger. No LLM.
 *
 * Applies the same rules used in my prompts to gemma3 / Claude:
 *   - SUBJECT  : pronouns I/you/he/she/it/we/they/this/that/etc, pronoun+verb
 *                contractions ("I'm", "you're", "that's"), bare nouns acting
 *                as subject of a finite verb.
 *   - AUX_VERB : be-forms (am/is/are/was/were/being/been) followed by V-ing
 *                or past-participle, have/has/had followed by past-part,
 *                modals (will/would/can/could/may/might/must/should/shall),
 *                do/does/did followed by main verb, aux+negation contractions
 *                (don't, isn't, won't, can't, etc.).
 *   - REST     : everything else (content verbs, adjectives, nouns, adverbs,
 *                prepositions, conjunctions, "not", "to", interjections).
 *
 * Run as a benchmark against current DB tags to measure rule-based accuracy:
 *   cd admin && npx tsx scripts/rule-based-tagger.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

// ─── Lexicon ───────────────────────────────────────────────────────────────
const ADVERBS = new Set([
  "not","never","always","really","very","just","still","already","only",
  "even","actually","definitely","probably","maybe","barely","totally",
  "literally","honestly","basically","currently","recently","simply","merely",
  "exactly","absolutely","kind","sort","usually","often","sometimes","rarely",
  "almost","nearly","perfectly","quite","pretty","rather","ever","seriously",
  "today","tomorrow","yesterday","now","soon","later","then","again",
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
  "checked","scheduled","mentioned","noticed","explained","achieved","wanted",
  "amused","required","colored","shaped","crooked","poisoned","tired","scared",
]);

const ING_NOT_VING = new Set([
  "nothing","something","anything","everything","king","ring","string","thing",
  "morning","evening","ceiling","spring","sing","wing","sting","feeling",
  "meeting","ending","beginning","painting","drawing","wedding","building",
  "amazing","interesting","exciting","boring","missing","willing","loving",
  "darling","sibling","earring","pudding",
]);

// Pronouns that are reliably nominative (can almost always be subject when
// they appear before a verb).
const NOMINATIVE_PRONOUNS = new Set([
  "i","you","he","she","it","we","they",
]);

// Demonstrative / interrogative / locative — treat as SUBJECT only when
// followed by a verb (otherwise REST).
const CONDITIONAL_SUBJECT = new Set([
  "this","that","these","those","one","who","what","which","there","here",
]);

const SUBJECT_PRONOUNS = new Set([...NOMINATIVE_PRONOUNS, ...CONDITIONAL_SUBJECT]);

// Determiners that can start a subject noun phrase ("the cat", "my dog").
const DETERMINERS = new Set([
  "the","a","an","this","that","these","those",
  "my","your","his","her","their","our","its",
  "no","every","each","all","both","some","any","another","other","such","what",
  "which","whose","one","two","three","four","five","six","seven","eight","nine","ten",
]);

// Coordinators / sentence boundaries that end a NP scan.
const NP_TERMINATORS = new Set([
  "and","or","but","so","because","when","while","if","that","which","who",
  "as","than","though","although","since","until","unless","whether","whereas",
]);

const SUBJECT_CONTRACTIONS = new Set([
  "i'm","you're","he's","she's","it's","we're","they're","that's","there's",
  "here's","what's","i'll","you'll","he'll","she'll","it'll","we'll","they'll",
  "that'll","i've","you've","we've","they've","who've","i'd","you'd","he'd",
  "she'd","we'd","they'd","that'd",
]);

const BE_FORMS = new Set(["am","is","are","was","were","being","been","'m","'re","'s"]);
const HAVE_FORMS = new Set(["have","has","had","'ve"]);
const MODALS = new Set([
  "can","could","will","would","should","may","might","must","shall",
  "'ll","'d",
]);
const DO_FORMS = new Set(["do","does","did"]);

const AUX_NEG = new Set([
  "don't","doesn't","didn't",
  "won't","wouldn't","can't","couldn't","shouldn't","shan't",
  "mustn't","mayn't","mightn't",
  "isn't","wasn't","aren't","weren't",
  "haven't","hasn't","hadn't",
]);

const PREPOSITIONS = new Set([
  "about","after","against","around","at","before","behind","below","beside",
  "between","beyond","by","during","except","for","from","in","into","like",
  "near","of","off","on","over","since","than","through","to","toward",
  "towards","under","until","up","upon","with","within","without",
]);

// Common content verbs (base form). Used to detect "do+main verb" pattern.
const COMMON_BASE_VERBS = new Set([
  "go","come","get","make","take","see","know","think","say","tell","ask",
  "give","find","want","need","like","love","feel","look","seem","keep",
  "leave","let","put","run","walk","talk","work","play","eat","drink","sleep",
  "live","stay","wait","watch","listen","hear","read","write","sing","dance",
  "stand","sit","fall","rise","drive","ride","fly","swim","cook","clean",
  "wash","buy","sell","pay","spend","save","help","stop","start","begin","end",
  "open","close","try","mean","matter","happen","become","seem","appear","exist",
  "remember","forget","understand","believe","hope","wish","wonder","worry",
  "decide","choose","plan","prepare","follow","lead","carry","bring","send",
  "receive","accept","refuse","agree","disagree","laugh","cry","smile","yell",
  "shout","whisper","speak","explain","describe","mention","report","announce",
  "answer","reply","respond","question","wonder","check","test","prove","show",
  "teach","learn","study","practice","train","exercise","compete","win","lose",
  "fight","attack","defend","protect","escape","hide","search","seek","find",
  "discover","invent","create","build","destroy","break","fix","repair","fail",
  "succeed","try","attempt","finish","complete","continue","change","grow","die",
  "kill","save","heal","hurt","feel","touch","kiss","hug","hold","grab","pull",
  "push","throw","catch","drop","raise","lift","move","stay","arrive","leave",
  "depart","return","visit","meet","greet","welcome","invite","join","leave",
  "marry","love","hate","like","dislike","enjoy","prefer","admire","respect",
  "trust","doubt","fear","scare","frighten","surprise","shock","amaze","impress",
  "annoy","bother","disturb","interrupt","distract","focus","concentrate","relax",
  "rest","wake","sleep","dream","imagine","remember","recall","memorize",
  "forget","ignore","notice","realize","recognize","identify","distinguish",
  "separate","combine","mix","share","split","divide","multiply","add","remove",
  "include","exclude","contain","involve","require","need","demand","request",
  "order","command","control","manage","handle","deal","cope","face","accept",
  "tolerate","endure","suffer","experience","enjoy","appreciate","value","matter",
]);

// ─── Helpers ───────────────────────────────────────────────────────────────
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

/** Walk forward past adverbs (and optionally one subject pronoun for inversion). */
function lookForward(
  words: string[], from: number,
  options: { skipOneSubject?: boolean } = {},
): { word: string; idx: number } | null {
  let crossedSubject = false;
  for (let j = from; j < words.length; j++) {
    const c = strip(words[j]);
    if (ADVERBS.has(c)) continue;
    if (options.skipOneSubject && !crossedSubject && SUBJECT_PRONOUNS.has(c)) {
      crossedSubject = true;
      continue;
    }
    return { word: words[j], idx: j };
  }
  return null;
}

/** Detect imperative-style line: starts with bare verb, no clear subject. */
function detectImperative(words: string[]): boolean {
  if (words.length === 0) return false;
  const first = strip(words[0]);
  if (SUBJECT_PRONOUNS.has(first)) return false;
  if (SUBJECT_CONTRACTIONS.has(first)) return false;
  if (BE_FORMS.has(first) || HAVE_FORMS.has(first) || MODALS.has(first) || DO_FORMS.has(first) || AUX_NEG.has(first)) return false;
  // Check if first content word looks like a base verb
  if (COMMON_BASE_VERBS.has(first)) return true;
  // Common imperatives outside the base list
  if (["come","go","get","stop","wait","look","listen","see","tell","ask","try","stay","let","please"].includes(first)) return true;
  return false;
}

// ─── Rule-based tagger ───────────────────────────────────────────────────
export interface Structure {
  subject: number[];
  aux_verb: number[];
  rest: number[];
}

/** Common irregular past tenses that don't end in -ed and aren't in
 *  COMMON_BASE_VERBS. Used by looksLikeVerb. */
const IRREGULAR_PAST_TENSES = new Set([
  "was","were","had","did","said","told","saw","went","came","made","took",
  "got","gave","found","felt","kept","left","brought","bought","caught","taught",
  "thought","sent","spent","met","held","read","fed","led","ran","sat","stood",
  "won","lost","heard","slept","drove","rose","arose","fell","grew","knew","threw",
  "blew","drew","flew","wrote","rode","spoke","drove","chose","froze","stole",
  "broke","spoke","wore","bore","tore","swore","forgave","began","sang","drank",
  "rang","sank","swam","forgot","forsook","shook","took","mistook","retook",
  "underwent","withstood","withheld","withdrew","overheard","overcame","overtook",
  "saw","said","felt","thought","got",
]);

/** Looks like a finite verb token (something a subject NP would precede). */
function looksLikeVerb(w: string): boolean {
  const c = strip(w);
  if (BE_FORMS.has(c) || HAVE_FORMS.has(c) || MODALS.has(c) || DO_FORMS.has(c) || AUX_NEG.has(c)) return true;
  if (COMMON_BASE_VERBS.has(c)) return true;
  if (IRREGULAR_PAST_TENSES.has(c)) return true;
  if (isVing(w) || isPP(w)) return true;
  // -s / -ed verb endings (heuristic; with caveats)
  if (c.length > 3 && c.endsWith('s') && !c.endsWith('ss') && !c.endsWith('us') && !c.endsWith('is')) return true;
  if (c.length > 3 && c.endsWith('ed')) return true;
  return false;
}

/** Tokens that act as clause boundaries — a noun right after one of these
 *  could start a fresh subject NP. */
const CLAUSE_STARTERS = new Set(["and","but","or","so","because","when","while","if"]);

function isClauseStart(words: string[], i: number): boolean {
  if (i === 0) return true;
  const prev = words[i - 1] ?? '';
  // Trailing comma/period/semicolon ends the previous clause
  if (/[,.;:]$/.test(prev)) return true;
  const p = strip(prev);
  if (CLAUSE_STARTERS.has(p)) return true;
  return false;
}

/** Detect bare-noun subjects: a non-pronoun, non-determiner content word at
 *  the start of a clause that is followed within a few tokens by a finite
 *  verb. Captures cases like "Water has memory" where there's no det. */
function detectBareNounSubjects(words: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (!isClauseStart(words, i)) continue;
    const c = strip(words[i]);
    if (!c) continue;
    // Skip if the word itself is something we already classify
    if (NOMINATIVE_PRONOUNS.has(c) || CONDITIONAL_SUBJECT.has(c)) continue;
    if (SUBJECT_CONTRACTIONS.has(c)) continue;
    if (BE_FORMS.has(c) || HAVE_FORMS.has(c) || MODALS.has(c) || DO_FORMS.has(c) || AUX_NEG.has(c)) continue;
    if (DETERMINERS.has(c)) continue; // det+noun handled by detectSubjectNPs
    if (PREPOSITIONS.has(c)) continue;
    if (NP_TERMINATORS.has(c)) continue;
    if (ADVERBS.has(c)) continue;
    if (COMMON_BASE_VERBS.has(c)) continue; // imperative
    if (isVing(words[i]) || isPP(words[i])) continue;

    // Look forward for a finite verb (be/have/modal/do/aux-neg) or a
    // recognisable content verb. Skip adverbs.
    let j = i + 1;
    let found = false;
    while (j < words.length && j - i <= 5) {
      const raw = words[j];
      const cj = strip(raw);
      if (!cj) {
        j++;
        continue;
      }
      if (ADVERBS.has(cj)) {
        j++;
        continue;
      }
      if (PREPOSITIONS.has(cj) || NP_TERMINATORS.has(cj)) break;
      if (looksLikeVerb(raw)) {
        found = true;
        break;
      }
      j++;
    }
    if (found) out.add(i);
  }
  return out;
}

/** Detect noun phrases starting with a determiner that precede a verb,
 *  e.g. "the cat is running" → indices of "the cat" are SUBJECT. Returns
 *  the set of token indices that should be in SUBJECT. */
function detectSubjectNPs(words: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const c = strip(words[i]);
    if (!DETERMINERS.has(c)) continue;
    // Skip if preceded by a preposition or a verb (then we're in an object/PP, not subject)
    if (i > 0) {
      const prev = strip(words[i - 1]);
      if (PREPOSITIONS.has(prev)) continue;
      if (looksLikeVerb(words[i - 1])) continue;
      if (NP_TERMINATORS.has(prev)) {
        // OK — could still be subject of a new clause. Don't skip.
      }
    }
    // Walk forward through descriptors until we hit a verb-like token or terminator
    let j = i + 1;
    let foundVerb = false;
    while (j < words.length) {
      const raw = words[j];
      const cj = strip(raw);
      // Break on punctuation that ends a clause
      if (/[,.;:!?]$/.test(raw)) {
        // also stop if this token is a verb (rare with trailing punct, but we need it for cases like "what?" etc.)
        if (looksLikeVerb(raw) && !DETERMINERS.has(cj) && !SUBJECT_PRONOUNS.has(cj)) {
          foundVerb = true;
        }
        break;
      }
      if (!cj) {
        j++;
        continue;
      }
      if (NP_TERMINATORS.has(cj) || PREPOSITIONS.has(cj)) break;
      if (looksLikeVerb(raw)) {
        if (!DETERMINERS.has(cj) && !SUBJECT_PRONOUNS.has(cj)) {
          foundVerb = true;
          break;
        }
      }
      j++;
    }
    if (foundVerb && j > i + 1) {
      for (let k = i; k < j; k++) out.add(k);
      i = j;
    }
  }
  return out;
}

export function tagSentence(words: string[]): Structure {
  const subject = new Set<number>();
  const aux_verb = new Set<number>();
  const rest = new Set<number>();
  const isImper = detectImperative(words);
  const npSubjects = detectSubjectNPs(words);
  const bareSubjects = detectBareNounSubjects(words);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const c = strip(w);

    if (!c) {
      rest.add(i);
      continue;
    }

    // NP subject (det + noun before a verb)
    if (npSubjects.has(i)) {
      subject.add(i);
      continue;
    }

    // Bare-noun subject (e.g. "Water has memory")
    if (bareSubjects.has(i)) {
      subject.add(i);
      continue;
    }

    // Subject contraction (always SUBJECT)
    if (SUBJECT_CONTRACTIONS.has(c)) {
      subject.add(i);
      continue;
    }

    // Subject pronoun: skip when it's clearly an object
    if (NOMINATIVE_PRONOUNS.has(c)) {
      if (isImper && i === 0) {
        rest.add(i);
        continue;
      }
      // After a preposition or verb → object → REST
      const prev = i > 0 ? strip(words[i - 1]) : '';
      if (PREPOSITIONS.has(prev)) {
        rest.add(i);
        continue;
      }
      // After a content verb → could be OBJECT or subject of a subordinate
      // clause. If the NEXT non-adverb token is a verb-form, this pronoun
      // is the subject of that clause. Otherwise it's the verb's object.
      const prevIsVerb = i > 0 && looksLikeVerb(words[i - 1]) &&
        !BE_FORMS.has(prev) && !HAVE_FORMS.has(prev) && !MODALS.has(prev) &&
        !DO_FORMS.has(prev) && !AUX_NEG.has(prev);
      if (prevIsVerb) {
        const next = lookForward(words, i + 1);
        if (!next || !looksLikeVerb(next.word)) {
          rest.add(i);
          continue;
        }
      }
      subject.add(i);
      continue;
    }

    if (CONDITIONAL_SUBJECT.has(c)) {
      // After a preposition → object → REST
      const prev = i > 0 ? strip(words[i - 1]) : '';
      if (PREPOSITIONS.has(prev)) {
        rest.add(i);
        continue;
      }
      // Only SUBJECT if followed by a verb-like token
      const next = lookForward(words, i + 1);
      if (next) {
        const nc = strip(next.word);
        const verbAfter =
          BE_FORMS.has(nc) || HAVE_FORMS.has(nc) || MODALS.has(nc) ||
          DO_FORMS.has(nc) || AUX_NEG.has(nc) ||
          COMMON_BASE_VERBS.has(nc) || isVing(next.word) || isPP(next.word) ||
          nc.endsWith('s') || nc.endsWith('ed');
        if (verbAfter) {
          subject.add(i);
          continue;
        }
      }
      rest.add(i);
      continue;
    }

    // Modal
    if (MODALS.has(c)) {
      aux_verb.add(i);
      continue;
    }

    // Aux+negation contraction
    if (AUX_NEG.has(c)) {
      aux_verb.add(i);
      continue;
    }

    // Do-form: AUX if followed (past adverbs/subjects) by a main verb
    if (DO_FORMS.has(c)) {
      const next = lookForward(words, i + 1, { skipOneSubject: true });
      if (next) {
        const nc = strip(next.word);
        // It's aux if the next non-adverb-non-subject content word looks like a verb
        const isVerbAfter =
          COMMON_BASE_VERBS.has(nc) || isVing(next.word) || isPP(next.word) ||
          nc.endsWith('ed');
        if (isVerbAfter) {
          aux_verb.add(i);
          continue;
        }
      }
      // Otherwise pro-form/main-verb (do as verb) → REST
      rest.add(i);
      continue;
    }

    // Be-form
    if (BE_FORMS.has(c)) {
      const direct = lookForward(words, i + 1);
      const inverted = lookForward(words, i + 1, { skipOneSubject: true });
      const auxJustified =
        (direct && (isVing(direct.word) || isPP(direct.word))) ||
        (inverted && (isVing(inverted.word) || isPP(inverted.word)));
      if (auxJustified) {
        aux_verb.add(i);
        continue;
      }
      rest.add(i);
      continue;
    }

    // Have-form
    if (HAVE_FORMS.has(c)) {
      const next = lookForward(words, i + 1, { skipOneSubject: true });
      if (next && isPP(next.word)) {
        aux_verb.add(i);
        continue;
      }
      rest.add(i);
      continue;
    }

    // Default: REST
    rest.add(i);
  }

  return {
    subject: [...subject].sort((a, b) => a - b),
    aux_verb: [...aux_verb].sort((a, b) => a - b),
    rest: [...rest].sort((a, b) => a - b),
  };
}

// ─── Benchmark against DB ─────────────────────────────────────────────────
function benchmark(): void {
  const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

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

  let totalTokens = 0;
  let exactTokens = 0;
  let totalLines = 0;
  let exactLines = 0;
  // Confusion matrix gold→pred
  const confusion: Record<string, Record<string, number>> = {
    subject: { subject: 0, aux_verb: 0, rest: 0 },
    aux_verb: { subject: 0, aux_verb: 0, rest: 0 },
    rest: { subject: 0, aux_verb: 0, rest: 0 },
  };
  const wrongSamples: { id: number; text: string; gold: string; pred: string }[] = [];

  for (const l of lines) {
    const tokens = fetchTokens.all(l.id) as { word_index: number; word: string }[];
    if (tokens.length === 0) continue;
    const gold = JSON.parse(l.structure) as Structure;
    const goldByIdx = new Map<number, 'subject' | 'aux_verb' | 'rest'>();
    for (const i of gold.subject) goldByIdx.set(i, 'subject');
    for (const i of gold.aux_verb) goldByIdx.set(i, 'aux_verb');
    for (const i of gold.rest) goldByIdx.set(i, 'rest');

    // Build word array indexed by position 0..n
    const words: string[] = [];
    const idxMap: number[] = []; // local position → original word_index
    for (const t of tokens) {
      words.push(t.word);
      idxMap.push(t.word_index);
    }
    const pred = tagSentence(words);
    const predByIdx = new Map<number, 'subject' | 'aux_verb' | 'rest'>();
    for (const i of pred.subject) predByIdx.set(idxMap[i], 'subject');
    for (const i of pred.aux_verb) predByIdx.set(idxMap[i], 'aux_verb');
    for (const i of pred.rest) predByIdx.set(idxMap[i], 'rest');

    let lineMatch = true;
    for (const t of tokens) {
      const g = goldByIdx.get(t.word_index) ?? 'rest';
      const p = predByIdx.get(t.word_index) ?? 'rest';
      totalTokens++;
      confusion[g][p]++;
      if (g === p) exactTokens++;
      else lineMatch = false;
    }
    totalLines++;
    if (lineMatch) exactLines++;
    else if (wrongSamples.length < 12) {
      wrongSamples.push({
        id: l.id,
        text: words.join(' '),
        gold: JSON.stringify(gold),
        pred: JSON.stringify(pred),
      });
    }
  }

  const tokenAcc = (100 * exactTokens) / totalTokens;
  const lineAcc = (100 * exactLines) / totalLines;
  console.log(`Rule-based tagger benchmark vs current DB tags`);
  console.log('---');
  console.log(`Lines:   ${totalLines.toLocaleString()}`);
  console.log(`Tokens:  ${totalTokens.toLocaleString()}`);
  console.log(`Token-level accuracy: ${tokenAcc.toFixed(1)}% (${exactTokens.toLocaleString()}/${totalTokens.toLocaleString()})`);
  console.log(`Line-level exact-match: ${lineAcc.toFixed(1)}% (${exactLines.toLocaleString()}/${totalLines.toLocaleString()})`);
  console.log('\nConfusion matrix (rows = gold, cols = predicted):');
  console.log('                  pred:subject   pred:aux       pred:rest');
  for (const g of ['subject', 'aux_verb', 'rest'] as const) {
    const row = confusion[g];
    console.log(
      `  gold:${g.padEnd(10)}  ${String(row.subject).padStart(8)}    ${String(row.aux_verb).padStart(8)}    ${String(row.rest).padStart(8)}`,
    );
  }

  // Per-bucket precision / recall
  console.log('\nPer-bucket precision / recall:');
  for (const c of ['subject', 'aux_verb', 'rest'] as const) {
    const tp = confusion[c][c];
    const fp = Object.entries(confusion).reduce(
      (s, [g, r]) => s + (g !== c ? r[c] : 0),
      0,
    );
    const fn = Object.entries(confusion[c]).reduce(
      (s, [p, n]) => s + (p !== c ? n : 0),
      0,
    );
    const precision = tp + fp > 0 ? (100 * tp) / (tp + fp) : 0;
    const recall = tp + fn > 0 ? (100 * tp) / (tp + fn) : 0;
    console.log(`  ${c.padEnd(10)}  P=${precision.toFixed(1)}%  R=${recall.toFixed(1)}%`);
  }

  console.log('\nSample mismatches:');
  for (const s of wrongSamples) {
    console.log(`  #${s.id}: ${s.text}`);
    console.log(`    gold: ${s.gold}`);
    console.log(`    pred: ${s.pred}`);
  }

  db.close();
}

if (require.main === module) {
  benchmark();
}
