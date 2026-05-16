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

// Hard-noun -ing words that should NEVER be re-classified as verbs even in
// the verb-context lookup. (Pure nouns and adjectives.)
const STRICT_ING_NOT_VING = new Set([
  "nothing","something","anything","everything","king","ring","string","thing",
  "morning","evening","ceiling","spring","wing","sting","darling","sibling",
  "earring","pudding","amazing","interesting","exciting","boring","willing",
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

// Words that act as auxiliary-style glue between an aux and the main verb:
// "am gonna need", "is going to need" (we treat "going" + "to" as aux when
// flanked by be + base verb).
const GONNA_TOKENS = new Set(["gonna","wanna","gotta"]);

// Wh-words that can be SENTENCE-INITIAL fronted material (REST when not the
// subject — e.g. "Where do I buy …").
const WH_FRONT = new Set(["where","when","why","how","what","who","which","whose"]);

// Discourse markers / interjections / conjunctions that commonly appear at
// the start of a sentence and are NOT the subject. Skip them as REST and
// look for the main clause's subject after them.
const LEADING_DISCOURSE = new Set([
  "yeah","yes","no","oh","well","ok","okay","shh","hey","hi","hello",
  "please","so","and","but","alright","right","huh","aw","ah","eh","uh",
  "um","hmm","oof","wow","whoa","yo","nah","yep","nope","gosh","damn",
  "dammit","jeez","sheesh","nevermind",
]);

// Discourse markers that are AMBIGUOUS with imperative verbs. Only skip
// these when they're followed by a comma (vocative/interjection use).
const LEADING_DISCOURSE_COMMA_ONLY = new Set([
  "look","listen","wait","stop","watch","hold","come",
]);

// Multi-word discourse markers (lower-case stripped). Each entry is a
// space-separated sequence; if the leading tokens match (with the LAST
// token of the sequence ending in a comma in the sentence), the whole
// phrase is skipped as a discourse opener.
const MULTI_WORD_DISCOURSE = [
  "all right",
  "of course",
  "you know",
  "i mean",
  "by the way",
  "in fact",
  "to be honest",
  "in other words",
  "for example",
  "for instance",
];

// Subordinators — when a sentence STARTS with one of these and there is no
// following comma + main clause, treat the whole sentence as a fragmentary
// subordinate clause: drop the subordinator into REST and tag the rest as
// if it were a normal main clause.
const SUBORDINATORS = new Set([
  "because","while","if","when","since","although","though","unless","until",
  "whereas","whether","as",
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
  "leave","let","put","run","walk","talk","work","play","eat","drink","sleep","hang",
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
  // -s / -ed verb endings (heuristic; with caveats). Possessive 's-ending
  // tokens (e.g. "Scott's") are NOT verbs.
  if (c.endsWith("'s")) return false;
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

/** Token classification used by the main-clause finder. */
type TokKind =
  | 'aux_be'      // am/is/are/was/were/been/being  ('m,'re,'s also)
  | 'aux_have'    // have/has/had  ('ve)
  | 'aux_do'      // do/does/did
  | 'aux_modal'   // can/will/etc, 'll, 'd
  | 'aux_neg'     // don't/isn't/can't/etc
  | 'aux_gonna'   // gonna/wanna/gotta — glue between aux and base verb
  | 'verb'        // a finite/non-finite content verb (vs aux)
  | 'subj_pron'   // I/you/he/she/it/we/they
  | 'subj_cond'   // this/that/these/those/who/what/which/there/here
  | 'subj_contr'  // I'm, you're, he's, ...
  | 'det'         // the/a/my/...
  | 'wh_front'    // where/when/why/how/what/who/which/whose (when fronted)
  | 'adv'         // not/never/always/...
  | 'prep'        // about/at/for/...
  | 'np_term'     // and/or/but/because/...
  | 'other';      // nouns, adjectives, anything we can't pin down

function classify(w: string): TokKind {
  const c = strip(w);
  if (!c) return 'other';
  if (SUBJECT_CONTRACTIONS.has(c)) return 'subj_contr';
  if (AUX_NEG.has(c)) return 'aux_neg';
  if (BE_FORMS.has(c)) return 'aux_be';
  if (HAVE_FORMS.has(c)) return 'aux_have';
  if (DO_FORMS.has(c)) return 'aux_do';
  if (MODALS.has(c)) return 'aux_modal';
  if (GONNA_TOKENS.has(c)) return 'aux_gonna';
  if (NOMINATIVE_PRONOUNS.has(c)) return 'subj_pron';
  if (CONDITIONAL_SUBJECT.has(c)) return 'subj_cond';
  if (DETERMINERS.has(c)) return 'det';
  if (WH_FRONT.has(c)) return 'wh_front';
  if (ADVERBS.has(c)) return 'adv';
  // Verb identification BEFORE prep/np_term so ambiguous tokens like "like"
  // (prep vs base verb) and "since"/"that" (np_term vs none) get verb priority
  // when they're clearly verbal forms.
  if (COMMON_BASE_VERBS.has(c)) return 'verb';
  if (IRREGULAR_PAST_TENSES.has(c)) return 'verb';
  if (isVing(w) || isPP(w)) return 'verb';
  if (PREPOSITIONS.has(c)) return 'prep';
  if (NP_TERMINATORS.has(c)) return 'np_term';
  // Heuristic: -ed / 3sg -s. Possessive 's-ending tokens (e.g. "Scott's",
  // "Pam's") are nouns/dependents — never verbs.
  if (c.length > 3 && c.endsWith('ed')) return 'verb';
  if (c.endsWith("'s")) return 'other';
  if (c.length > 3 && c.endsWith('s') && !c.endsWith('ss') && !c.endsWith('us') && !c.endsWith('is')) return 'verb';
  return 'other';
}

/**
 * Verb-position-aware classifier. Used INSIDE the verb chunk walker, where
 * we know we're looking for a verb. Treats ambiguous tokens that COULD be
 * Vings (e.g. "feeling", "meeting") as verbs even if the global blocklist
 * usually rejects them.
 */
function classifyVerbContext(w: string): TokKind {
  const k = classify(w);
  if (k === 'verb' || isAuxKind(k)) return k;
  const c = strip(w);
  if (!c) return k;
  // Re-allow blocklisted -ing words as verbs in this context, BUT keep out
  // the pure nouns / adjectives (e.g. "everything", "amazing").
  if (c.endsWith('ing') && c.length > 3 && !STRICT_ING_NOT_VING.has(c)) return 'verb';
  return k;
}

function isAuxKind(k: TokKind): boolean {
  return k === 'aux_be' || k === 'aux_have' || k === 'aux_do' ||
         k === 'aux_modal' || k === 'aux_neg' || k === 'aux_gonna';
}

function isSubjectStartKind(k: TokKind): boolean {
  return k === 'subj_pron' || k === 'subj_cond' || k === 'subj_contr' || k === 'det';
}

/** Skip leading punctuation/empty tokens. */
function firstContentIdx(words: string[], from: number): number {
  for (let i = from; i < words.length; i++) {
    if (strip(words[i])) return i;
  }
  return -1;
}

/**
 * Skip leading discourse markers, conjunctions, vocatives, and interjections
 * before the main clause. Returns the index of the first content token of
 * the main clause (or `from` if nothing was skipped).
 *
 * Skips:
 *   - Tokens in LEADING_DISCOURSE (yeah, no, oh, well, and, but, ...).
 *   - Tokens in LEADING_DISCOURSE_COMMA_ONLY when followed by a comma.
 *   - At the very first position only: any single content token followed
 *     immediately by a comma (vocative pattern, e.g. "Peter," / "Frank,").
 *
 * Each skipped token is REST. The returned index is where main-clause
 * detection (subject + verb) should begin.
 */
function skipLeadingDiscourse(words: string[], from: number): number {
  let i = firstContentIdx(words, from);
  if (i < 0) return from;
  let isFirst = true;

  while (i < words.length) {
    const raw = words[i];
    const c = strip(raw);
    if (!c) { i++; isFirst = false; continue; }

    // Multi-word discourse phrases ("all right,", "of course,", ...)
    const mw = tryMultiWordDiscourse(words, i);
    if (mw > i) {
      i = mw;
      isFirst = false;
      continue;
    }

    const endsWithComma = /,$/.test(raw);

    // Discourse markers that we ALWAYS skip at clause start.
    if (LEADING_DISCOURSE.has(c)) {
      i++;
      isFirst = false;
      continue;
    }
    // Ambiguous (imperative or discourse): skip only with comma.
    if (LEADING_DISCOURSE_COMMA_ONLY.has(c) && endsWithComma) {
      i++;
      isFirst = false;
      continue;
    }
    // Vocative pattern: a single content token followed by a comma at the
    // very first position (e.g. "Peter,", "Mom,"). Only fire on the first
    // pass so we don't accidentally chew through every comma-ended token.
    if (isFirst && endsWithComma) {
      // Don't skip if this token is itself a likely subject-starter (we'd
      // rather just keep it).
      const k = classify(raw);
      if (!isSubjectStartKind(k) && !isAuxKind(k) && k !== 'verb' && k !== 'wh_front') {
        i++;
        isFirst = false;
        continue;
      }
    }
    // Multi-token vocative pattern: starts with a capitalized title-ish word
    // ("Mr.", "Mrs.", "Dr.", "Captain") and the next 1-2 capitalized tokens
    // include a comma terminator. e.g. "Mr. Novarski, please follow me."
    if (isFirst) {
      const skip = tryMultiTokenVocative(words, i);
      if (skip > i) {
        i = skip;
        isFirst = false;
        continue;
      }
    }
    break;
  }
  return i;
}

/** Try to match a leading multi-word discourse marker ("All right,",
 *  "Of course,", ...). The phrase must be followed by a comma on its last
 *  token. Returns the index just past the matched phrase (and its comma)
 *  or `i` if no match. */
function tryMultiWordDiscourse(words: string[], i: number): number {
  const cFirst = strip(words[i]);
  if (!cFirst) return i;
  for (const phrase of MULTI_WORD_DISCOURSE) {
    const parts = phrase.split(' ');
    if (i + parts.length > words.length) continue;
    let ok = true;
    for (let k = 0; k < parts.length; k++) {
      if (strip(words[i + k]) !== parts[k]) { ok = false; break; }
    }
    if (!ok) continue;
    // The last token of the phrase must end with a comma in the sentence.
    if (!/,$/.test(words[i + parts.length - 1])) continue;
    return i + parts.length;
  }
  return i;
}

/** Detect a multi-token vocative-with-comma at the start of a sentence.
 *  Returns the index just past the comma, or -1 if no match.
 *  Conservative: only fires for capitalized leading sequences ending in a
 *  comma within 4 tokens. Excludes when the first token is a known function
 *  word or could be the subject of a finite verb. */
function tryMultiTokenVocative(words: string[], i: number): number {
  if (i >= words.length) return i;
  const first = words[i];
  const c0 = strip(first);
  if (!c0) return i;
  // Don't skip if first token is itself classifiable as subject/aux/verb/wh.
  const k0 = classify(first);
  if (isSubjectStartKind(k0) || isAuxKind(k0) || k0 === 'verb' || k0 === 'wh_front') return i;
  // Must start with a capital letter (proper noun / title / vocative term).
  if (!/^[A-Z]/.test(first)) return i;
  // Walk up to 4 tokens, all capitalized, until we hit a comma terminator.
  let j = i;
  while (j < words.length && j - i < 4) {
    const raw = words[j];
    const cj = strip(raw);
    if (!cj) { j++; continue; }
    if (!/^[A-Z]/.test(raw) && !/^[A-Z]/.test(cj.charAt(0).toUpperCase())) {
      // continuation must be capitalized
      if (j > i) return i; // give up
    }
    if (!/^[A-Z]/.test(raw)) return i; // must stay capitalized
    if (/,$/.test(raw)) {
      // Found the comma — skip everything up to and including this token.
      return j + 1;
    }
    j++;
  }
  return i;
}

/** True if the bare-form word `c` is plausibly a noun continuation in an NP
 *  — i.e. not a function word, not an obvious verb, not a clause boundary. */
function isNounContinuation(raw: string, c: string): boolean {
  if (!c) return false;
  if (DETERMINERS.has(c)) return false;
  if (PREPOSITIONS.has(c)) return false;
  if (NP_TERMINATORS.has(c)) return false;
  if (ADVERBS.has(c)) return false;
  if (BE_FORMS.has(c) || HAVE_FORMS.has(c) || MODALS.has(c) || DO_FORMS.has(c) || AUX_NEG.has(c)) return false;
  if (SUBJECT_PRONOUNS.has(c) || SUBJECT_CONTRACTIONS.has(c)) return false;
  if (COMMON_BASE_VERBS.has(c)) return false;
  if (IRREGULAR_PAST_TENSES.has(c)) return false;
  if (isVing(raw) || isPP(raw)) return false;
  if (WH_FRONT.has(c)) return false;
  return true;
}

/**
 * Walk a bare-noun subject NP. Starts at `start` (a non-pronoun, non-det
 * content noun like "Water" or "Republic"). Walks forward through:
 *   - "of"-phrase continuations: "of Cricogia", "of the King"
 *   - possessive-'s-attached chunks: "Sarah's mom"
 *   - capitalized proper-noun continuations: "Mary Smith"
 * Stops at the first verb-like token or sentence boundary.
 *
 * Returns null if no verb is found within ~6 tokens (so we don't run away).
 */
function walkBareNounSubjectNP(
  words: string[], start: number, max: number,
): { end: number } | null {
  let j = start + 1;
  let foundVerb = false;
  let allowOf = true;

  while (j < max && j - start <= 6) {
    const raw = words[j];
    const c = strip(raw);
    if (!c) { j++; continue; }

    // Punctuation that ends a clause stops the walk.
    if (/[.,;:!?]$/.test(raw)) {
      // Heuristic: if this token IS a verb (rare with trailing punct), keep it.
      const kp = classify(raw);
      if (kp === 'verb' || isAuxKind(kp)) {
        foundVerb = true;
      }
      break;
    }

    const k = classify(raw);
    if (isAuxKind(k) || k === 'verb') {
      foundVerb = true;
      break;
    }
    // Allow "of" exactly once, expecting a noun continuation right after.
    if (c === 'of' && allowOf) {
      allowOf = false;
      j++;
      continue;
    }
    // Allow possessive contractions like "Sarah's" — strip ends with "'s".
    if (/['']s$/.test(raw) || /'s$/i.test(raw)) {
      j++;
      continue;
    }
    // Allow noun-ish continuation (proper nouns, common nouns, adjectives).
    if (isNounContinuation(raw, c)) {
      j++;
      continue;
    }
    // Otherwise, this is the end of the NP. Don't include it.
    break;
  }

  if (!foundVerb) return null;
  return { end: j };
}

/** True if `cursor` is the start of a content word that could start a
 *  bare-noun subject NP (capitalized proper noun OR a common noun). */
function couldStartBareNounSubject(words: string[], cursor: number): boolean {
  if (cursor >= words.length) return false;
  const raw = words[cursor];
  const c = strip(raw);
  if (!c) return false;
  if (NOMINATIVE_PRONOUNS.has(c) || CONDITIONAL_SUBJECT.has(c)) return false;
  if (SUBJECT_CONTRACTIONS.has(c)) return false;
  if (BE_FORMS.has(c) || HAVE_FORMS.has(c) || MODALS.has(c) || DO_FORMS.has(c) || AUX_NEG.has(c)) return false;
  if (DETERMINERS.has(c)) return false;
  if (PREPOSITIONS.has(c)) return false;
  if (NP_TERMINATORS.has(c)) return false;
  if (ADVERBS.has(c)) return false;
  if (WH_FRONT.has(c)) return false;
  if (COMMON_BASE_VERBS.has(c)) return false;
  if (IRREGULAR_PAST_TENSES.has(c)) return false;
  if (isVing(words[cursor]) || isPP(words[cursor])) return false;
  // Anything left is a noun-ish content word.
  return true;
}

/**
 * If the sentence (starting at `cursor`) opens with a SUBORDINATOR (because,
 * while, if, when, ...), figure out where the main clause starts.
 *   - If there is no later comma, treat the whole sentence as a subordinate
 *     fragment: drop the subordinator into REST and tag the rest as main.
 *     Returns cursor + 1.
 *   - If there IS a later comma, treat everything up to and including the
 *     comma as REST (the subordinate clause) and run main-clause detection
 *     on what follows. Returns the index just past the comma.
 *   - Otherwise returns -1 (no change).
 */
function detectSubordinateOnlyOffset(words: string[], cursor: number): number {
  if (cursor >= words.length) return -1;
  const c = strip(words[cursor]);
  if (!SUBORDINATORS.has(c)) return -1;
  // Look for a comma later in the sentence.
  for (let i = cursor + 1; i < words.length; i++) {
    if (/,$/.test(words[i])) {
      // Subordinate clause + main clause. Skip past the comma.
      // Don't fire if the comma is at the very end (no main clause text).
      if (i + 1 >= words.length) break;
      return i + 1;
    }
  }
  return cursor + 1;
}

/**
 * Walk a subject NP starting at index `start`. Returns the [start, end)
 * half-open range covering the NP. Stops at the first verb-like token,
 * preposition, NP_TERMINATOR, or punctuation-ended token.
 */
function walkSubjectNP(words: string[], start: number, max: number): { end: number } {
  // Subject contractions and pronouns are single-token NPs.
  const startKind = classify(words[start]);
  if (startKind === 'subj_pron' || startKind === 'subj_contr') {
    return { end: start + 1 };
  }
  // Demonstratives (this/that/these/those) are pronoun OR determiner.
  // If the NEXT token is verb/aux/punctuation, treat as pronoun (single token).
  // If the next token is a noun-ish word, walk through it as det+noun NP.
  if (startKind === 'subj_cond') {
    const nextIdx = start + 1;
    if (nextIdx >= max) return { end: nextIdx };
    const nextRaw = words[nextIdx];
    const nextK = classify(nextRaw);
    // If next token is a verb/aux/prep/np_term/wh — single-token pronoun.
    if (isAuxKind(nextK) || nextK === 'verb' || nextK === 'prep' ||
        nextK === 'np_term' || nextK === 'wh_front') {
      return { end: nextIdx };
    }
    if (/[,.;:!?]$/.test(words[start])) {
      return { end: nextIdx };
    }
    // Otherwise fall through to NP-walk (this/that/these/those as determiner).
  }
  // Determiner-led NP: walk forward through descriptors until we hit a verb.
  let j = start + 1;
  while (j < max) {
    const raw = words[j];
    const k = classify(raw);
    if (isAuxKind(k) || k === 'verb') break;
    if (k === 'prep' || k === 'np_term') break;
    if (k === 'wh_front') break;
    if (/[,.;:!?]$/.test(raw)) {
      // Include this token (e.g. trailing-comma noun) then stop.
      j++;
      break;
    }
    j++;
  }
  return { end: j };
}

/**
 * Find the predicate verb chunk starting at the first aux/verb token at
 * or after `from`. Walks through any combination of aux + adverb/neg + aux
 * (e.g. "has not been working", "have always loved", "am gonna need"),
 * ending at the first non-aux verb token (the main verb).
 *
 * Returns the indices of all tokens in the chunk, plus the index of the
 * main verb (last verb in the chain). If no verb is found, returns null.
 */
function findVerbChunk(
  words: string[], from: number, end: number,
): { chunkIdx: number[]; mainVerbIdx: number } | null {
  // Locate the first aux or verb at/after `from`.
  let start = -1;
  for (let i = from; i < end; i++) {
    const k = classifyVerbContext(words[i]);
    if (isAuxKind(k) || k === 'verb') { start = i; break; }
    // Anything other than adverb breaks the search — but if it's a non-aux,
    // non-verb, non-adverb token (e.g. "the", a noun), we have no verb.
    if (k === 'adv') continue;
    return null;
  }
  if (start < 0) return null;

  const chunk: number[] = [];
  let mainVerbIdx = -1;
  let i = start;
  let lastWasAux = false;

  while (i < end) {
    const raw = words[i];
    const k = classifyVerbContext(raw);
    if (isAuxKind(k)) {
      chunk.push(i);
      lastWasAux = true;
      i++;
      continue;
    }
    if (k === 'verb') {
      // Main verb. Add it and stop.
      chunk.push(i);
      mainVerbIdx = i;
      i++;
      break;
    }
    if (k === 'adv' && lastWasAux) {
      // Adverb sitting between aux and (eventual) main verb — include it.
      chunk.push(i);
      i++;
      continue;
    }
    // Anything else terminates the chunk (the previous aux ends up being
    // the linking/main verb itself, e.g. "She is happy").
    break;
  }

  // If we never hit a 'verb' kind, the last aux IS the main verb (linking
  // be/have/etc — "She is happy", "He has it").
  if (mainVerbIdx < 0 && chunk.length > 0) {
    mainVerbIdx = chunk[chunk.length - 1];
  }
  if (chunk.length === 0) return null;

  // Trim trailing adverbs from the chunk (they only stay if BETWEEN aux
  // and main verb, not after).
  while (chunk.length > 0 && classifyVerbContext(words[chunk[chunk.length - 1]]) === 'adv') {
    chunk.pop();
  }
  if (chunk.length === 0) return null;
  if (mainVerbIdx > chunk[chunk.length - 1]) {
    mainVerbIdx = chunk[chunk.length - 1];
  }

  return { chunkIdx: chunk, mainVerbIdx };
}

export function tagSentence(words: string[]): Structure {
  const subject = new Set<number>();
  const aux_verb = new Set<number>();
  const rest = new Set<number>();
  const n = words.length;

  // Default everything to REST; we'll move tokens out as we identify them.
  for (let i = 0; i < n; i++) rest.add(i);

  if (n === 0) {
    return { subject: [], aux_verb: [], rest: [] };
  }

  // ── Locate the start of the main clause's "subject zone" ────────────────
  // Skip sentence-initial fronted material: wh-front words ("Where do I…"),
  // pure adverbs at position 0 ("Today I went…"), or leading punctuation.
  let cursor = firstContentIdx(words, 0);
  if (cursor < 0) {
    // Empty / punctuation only.
    return {
      subject: [],
      aux_verb: [],
      rest: [...rest].sort((a, b) => a - b),
    };
  }

  // Skip leading discourse markers / interjections / vocatives. They stay
  // in REST. ("Yeah,", "Well, yeah,", "Peter,", "And no,", ...)
  cursor = skipLeadingDiscourse(words, cursor);
  if (cursor >= n) {
    return {
      subject: [],
      aux_verb: [],
      rest: [...rest].sort((a, b) => a - b),
    };
  }

  // Skip leading wh-front + leading adverbs; they stay in REST.
  while (cursor < n) {
    const k = classify(words[cursor]);
    if (k === 'wh_front' || k === 'adv') {
      cursor++;
      continue;
    }
    break;
  }
  if (cursor >= n) {
    return {
      subject: [],
      aux_verb: [],
      rest: [...rest].sort((a, b) => a - b),
    };
  }

  // Subordinate-clause-only fragment: sentence starts with a subordinator
  // (because/while/if/...) and there's no later main clause. Drop the
  // subordinator into REST and tag the rest as if it were a main clause.
  const subOffset = detectSubordinateOnlyOffset(words, cursor);
  if (subOffset > 0) {
    cursor = subOffset;
    if (cursor >= n) {
      return {
        subject: [],
        aux_verb: [],
        rest: [...rest].sort((a, b) => a - b),
      };
    }
  }

  const firstKind = classify(words[cursor]);

  // ── Detect inversion (questions, "Do you …", "Did she …") ───────────────
  // If first non-fronted token is an aux/modal/do-form, the SUBJECT comes
  // AFTER it.
  let subjStart = -1;
  let subjEnd = -1;            // half-open
  let leadingAuxIdx = -1;       // for inversion
  let verbScanFrom = -1;

  if (isAuxKind(firstKind)) {
    // Inversion: aux + subject + (rest of verb chunk).
    leadingAuxIdx = cursor;
    // Subject = the next subject-starting token.
    let sIdx = cursor + 1;
    while (sIdx < n) {
      const k = classify(words[sIdx]);
      if (isSubjectStartKind(k)) break;
      // Skip adverbs between aux and subject (rare).
      if (k === 'adv') { sIdx++; continue; }
      // Anything else: no subject found; bail.
      sIdx = -1;
      break;
    }
    if (sIdx >= 0 && sIdx < n) {
      const np = walkSubjectNP(words, sIdx, n);
      subjStart = sIdx;
      subjEnd = np.end;
      verbScanFrom = subjEnd;
    } else {
      // No subject after the aux — treat the aux as a normal main-clause
      // start (no inversion); it'll be handled below.
      verbScanFrom = cursor;
    }
  } else if (isSubjectStartKind(firstKind)) {
    const np = walkSubjectNP(words, cursor, n);
    subjStart = cursor;
    subjEnd = np.end;
    verbScanFrom = subjEnd;
  } else if (couldStartBareNounSubject(words, cursor)) {
    // Bare-noun subject NP — walk through "of"-phrases and proper-noun
    // continuations until we hit a verb. ("Water has memory.",
    // "Republic of Cricogia is …".)
    const np = walkBareNounSubjectNP(words, cursor, n);
    if (np) {
      subjStart = cursor;
      subjEnd = np.end;
      verbScanFrom = subjEnd;
    } else {
      // No verb found — fragment. Still try the verb scan in case it's an
      // imperative-ish line ("Hang in there." with "Hang" classified as
      // 'verb' via COMMON_BASE_VERBS).
      verbScanFrom = cursor;
    }
  } else {
    // No clear subject — likely an imperative or fragment.
    verbScanFrom = cursor;
  }

  // ── Find the main predicate verb chunk ──────────────────────────────────
  const verb = findVerbChunk(words, verbScanFrom, n);

  // If we found neither a leading aux (inversion) nor a verb chunk after
  // the would-be subject, treat the whole line as REST — there's no finite
  // clause to tag (e.g. "No, no.", "Cricogia!").
  const haveAnyVerb = verb !== null || leadingAuxIdx >= 0;

  // ── Mark subject tokens ─────────────────────────────────────────────────
  if (subjStart >= 0 && haveAnyVerb) {
    for (let i = subjStart; i < subjEnd; i++) {
      subject.add(i);
      rest.delete(i);
    }
  }

  // ── Mark predicate verb chunk (including leading aux on inversion) ──────
  if (verb) {
    for (const idx of verb.chunkIdx) {
      aux_verb.add(idx);
      rest.delete(idx);
    }
  }
  if (leadingAuxIdx >= 0) {
    aux_verb.add(leadingAuxIdx);
    rest.delete(leadingAuxIdx);
  }

  // ── Subject contractions: split-bucket — pronoun half stays SUBJECT,
  // aux half stays in AUX_VERB. Our tokenization keeps "I'm" / "you're"
  // as a single token, so we mark it as both? No — the spec says subject
  // contractions are a single token labeled SUBJECT. Keep as SUBJECT.
  // (This matches the existing SUBJECT_CONTRACTIONS handling.)

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
