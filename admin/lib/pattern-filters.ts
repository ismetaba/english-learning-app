// Sentence patterns as SQL: which subtitle lines each pattern of the iOS
// PatternCatalog matches. The pattern scenes route reels these lines; the
// clips route marks Spanish lines with the patterns they contain.
import type { Lang } from '@/lib/lang';
import { ADJ_AFTER_COPULA, COPULAS_BY_PATTERN, COPULA_INTENSIFIERS } from '@/lib/es-copula';

export interface PatternFilter {
  /** Human label shown in logs / responses. */
  label: string;
  /** SQL fragment that picks lines starting with the pattern. Must be
   *  prefixed with AND and reference `sl.text`. */
  sqlPredicate: string;
  /** Learning language of the lines this pattern matches (default 'en').
   *  The pattern id alone decides it, so a request never mixes English
   *  and Spanish lines whatever ?lang= it carries. */
  lang?: Lang;
}

/** Common-conversation adjectives that follow "I am ..." or "I'm ...".
 *  Curated rather than POS-derived because vocab_words.part_of_speech
 *  only covers the ~95 A2 starters; everyday adjectives like "sorry"
 *  or "fine" aren't tagged. Lowercased, single-word; the SQL strips
 *  punctuation off word tokens before checking membership. */
const ADJ_AFTER_I_AM = [
  // feelings / emotions
  'sorry', 'glad', 'happy', 'sad', 'angry', 'mad', 'upset', 'bored',
  'nervous', 'anxious', 'worried', 'excited', 'thrilled', 'pleased',
  'satisfied', 'proud', 'embarrassed', 'ashamed', 'guilty', 'confused',
  'surprised', 'shocked', 'disappointed', 'jealous', 'calm', 'relaxed',
  'lonely', 'depressed', 'grateful', 'honored', 'curious', 'hopeful',
  'hopeless', 'helpless', 'flattered', 'disgusted', 'horrified',
  // physical / bodily state
  'tired', 'exhausted', 'sleepy', 'hungry', 'thirsty', 'sick', 'ill',
  'well', 'fine', 'hurt', 'lost', 'awake', 'asleep', 'drowsy', 'weary',
  'starving', 'freezing', 'boiling', 'wet', 'soaked', 'pregnant',
  'drunk', 'sober', 'hungover', 'broken',
  // states / readiness
  'ready', 'busy', 'free', 'alone', 'sure', 'certain', 'late', 'early',
  'available', 'unavailable', 'safe', 'stuck', 'done', 'finished',
  'comfortable', 'uncomfortable', 'positive', 'willing', 'aware',
  'responsible',
  // descriptive / personality
  'ok', 'okay', 'right', 'wrong', 'serious', 'kidding', 'joking',
  'married', 'single', 'divorced', 'lucky', 'unlucky', 'blessed',
  'cursed', 'smart', 'stupid', 'dumb', 'silly', 'foolish', 'kind',
  'mean', 'nice', 'friendly', 'rude', 'polite', 'crazy', 'insane',
  'weird', 'strange', 'normal',
  // physical descriptive
  'beautiful', 'ugly', 'handsome', 'pretty', 'gorgeous', 'fat', 'thin',
  'strong', 'weak', 'big', 'small', 'short', 'tall', 'young', 'old',
  'new', 'rich', 'poor',
  // evaluative
  'good', 'bad', 'awful', 'terrible', 'wonderful', 'great', 'amazing',
  'fantastic', 'brilliant', 'incredible', 'perfect', 'important',
  'different', 'easy', 'hard', 'better', 'worse', 'best', 'worst',
  // additional everyday adjectives surfaced from corpus misses
  'pathetic', 'older', 'younger', 'cheap', 'expensive', 'fast', 'slow',
  'quiet', 'loud', 'late', 'early', 'soft', 'angry', 'jealous',
  'bored', 'pissed', 'overwhelmed', 'fed up', 'cool', 'cute',
  'adorable', 'lovely', 'nice', 'evil', 'wicked', 'innocent',
];

/** Light intensifiers that introduce an adjective:
 *  "I am so happy", "I'm really tired". The query also accepts these
 *  in the slot right after "am"/"I'm" provided the next word is a
 *  known adjective. Kept short so we don't sweep in adverbs that
 *  rarely precede an adjective in conversation. */
const ADJ_INTENSIFIERS = [
  'so', 'very', 'really', 'totally', 'quite', 'super', 'extremely',
  'absolutely', 'completely', 'truly', 'honestly', 'actually', 'too',
  'pretty', 'kinda', 'sort', 'kind',
];

function sqlList(words: string[]): string {
  // single-quoted, escaped — adjectives are alphabetic so no escaping
  // needed beyond doubling apostrophes (none of our entries have one).
  return words.map(w => `'${w}'`).join(',');
}

/** Builds the EXISTS-clause SQL for a "<subject> <be> + adjective"
 *  pattern. Accepts arrays of prefixes so a single rule can cover
 *  all three variants of a row (e.g. He/She/It → "he is", "she is",
 *  "it is" + the matching contractions). All full-form prefixes
 *  share one slot index; all contraction prefixes share another.
 *  The body checks: direct adjective | intensifier+adj | not+adj |
 *  not+intensifier+adj — so "I am so happy", "you're not sure",
 *  "he is not very excited" all match. */
function buildBeAdjPredicate(opts: {
  fullPrefixes: string[];          // e.g. ["he is ", "she is ", "it is "] — each ends in space
  fullSlotIndex: number;           // word_index of the slot after BE in the full form
  contractionPrefixes: string[];   // e.g. ["he's ", "she's ", "it's "]
  contractionSlotIndex: number;
}): string {
  const { fullPrefixes, fullSlotIndex, contractionPrefixes, contractionSlotIndex } = opts;
  // SQL string-quoted, with apostrophes doubled.
  const sqlEscape = (s: string) => s.replace(/'/g, "''");
  const fps = fullPrefixes.map(sqlEscape);
  const cps = contractionPrefixes.map(sqlEscape);
  // OR'd LIKE list for prefix membership.
  const fpAny = fps.map(p => `LOWER(TRIM(sl.text)) LIKE '${p}%'`).join(' OR ');
  const cpAny = cps.map(p => `LOWER(TRIM(sl.text)) LIKE '${p}%'`).join(' OR ');
  // The slot right after BE can hold:
  //   1. a direct adjective                                  ("I am tired")
  //   2. an intensifier + adjective                          ("I'm really tired")
  //   3. a negation + adjective                              ("I am not happy")
  //   4. a negation + intensifier + adjective                ("I'm not very happy")
  // Cases 3 & 4 reuse the wt2/wt3 structure to peek further into the
  // sentence. The clean strip on each word removes wrapping punctuation
  // so "tired." matches the bare adjective list.
  const clean = `LOWER(TRIM(wt%.word, '.,!?;:"' || char(39)))`;
  const adj = `${clean} IN (${sqlList(ADJ_AFTER_I_AM)})`;
  const intensifier = `${clean} IN (${sqlList(ADJ_INTENSIFIERS)})`;
  const isNot = `${clean} = 'not'`;
  const c1 = adj.replace(/wt%/g, 'wt1');
  const i1 = intensifier.replace(/wt%/g, 'wt1');
  const n1 = isNot.replace(/wt%/g, 'wt1');
  const a2 = adj.replace(/wt%/g, 'wt2');
  const i2 = intensifier.replace(/wt%/g, 'wt2');
  const a3 = adj.replace(/wt%/g, 'wt3');

  return `
    AND ((${fpAny}) OR (${cpAny}))
    AND EXISTS (
      SELECT 1 FROM word_timestamps wt1
      WHERE wt1.line_id = sl.id
        AND (
          ((${fpAny}) AND wt1.word_index = ${fullSlotIndex})
          OR ((${cpAny}) AND wt1.word_index = ${contractionSlotIndex})
        )
        AND (
          -- 1. direct adjective
          ${c1}
          -- 2. intensifier + adjective
          OR (${i1} AND EXISTS (
            SELECT 1 FROM word_timestamps wt2
            WHERE wt2.line_id = sl.id
              AND wt2.word_index = wt1.word_index + 1
              AND ${a2}
          ))
          -- 3 & 4. negation, possibly with intensifier
          OR (${n1} AND EXISTS (
            SELECT 1 FROM word_timestamps wt2
            WHERE wt2.line_id = sl.id
              AND wt2.word_index = wt1.word_index + 1
              AND (
                ${a2}
                OR (${i2} AND EXISTS (
                  SELECT 1 FROM word_timestamps wt3
                  WHERE wt3.line_id = sl.id
                    AND wt3.word_index = wt2.word_index + 1
                    AND ${a3}
                ))
              )
          ))
        )
    )`;
}

/** A Spanish subtitle token as a bare lowercase word (`wt%` is the
 *  word_timestamps alias): wrapping punctuation goes, the inverted ¿ ¡
 *  that open questions and exclamations included. */
const ES_CLEAN = `LOWER(TRIM(wt%.word, '.,!?;:"¿¡…' || char(39)))`;

/** Spanish analog of `buildBeAdjPredicate` for the ser/estar +
 *  adjective family. Spanish is pro-drop (the subject pronoun is usually
 *  omitted: "Estoy cansado" = "Yorgunum"), so this keys on the COPULA
 *  word itself rather than a sentence-leading pronoun prefix: any line
 *  with a copula form from `copulas` immediately followed by an adjective
 *  (or intensifier + adjective). Negation ("no estoy cansado") sits BEFORE
 *  the copula, so it doesn't break the adjacency. The trim set adds the
 *  inverted ¿ ¡ that open Spanish questions and exclamations. */
function buildCopulaAdjPredicate(copulas: string[]): string {
  const clean = ES_CLEAN;
  const copulaIn = `${clean.replace(/wt%/g, 'wt1')} IN (${sqlList(copulas)})`;
  const adj2 = `${clean.replace(/wt%/g, 'wt2')} IN (${sqlList(ADJ_AFTER_COPULA)})`;
  const int2 = `${clean.replace(/wt%/g, 'wt2')} IN (${sqlList(COPULA_INTENSIFIERS)})`;
  const adj3 = `${clean.replace(/wt%/g, 'wt3')} IN (${sqlList(ADJ_AFTER_COPULA)})`;

  return `
    AND EXISTS (
      SELECT 1 FROM word_timestamps wt1
      WHERE wt1.line_id = sl.id
        AND ${copulaIn}
        AND EXISTS (
          SELECT 1 FROM word_timestamps wt2
          WHERE wt2.line_id = sl.id
            AND wt2.word_index = wt1.word_index + 1
            AND (
              -- copula + adjective ("estoy cansado")
              ${adj2}
              -- copula + intensifier + adjective ("es muy guapo")
              OR (${int2} AND EXISTS (
                SELECT 1 FROM word_timestamps wt3
                WHERE wt3.line_id = sl.id
                  AND wt3.word_index = wt2.word_index + 1
                  AND ${adj3}
              ))
            )
        )
    )`;
}

/** One word slot of a Spanish verb pattern: one of the given words, any
 *  word but the given ones, or an infinitive. */
type Slot = { is: string[] } | { not: string[] } | 'infinitive';

/** Infinitives as GLOB shapes: -ar / -er / -ir (oír, reír), alone or with
 *  the object pronouns Spanish writes onto them ("verlo", "ayudarme",
 *  "irnos", "dármelo", whose stress mark lands on the verb's vowel). */
const INFINITIVE_GLOBS = [
  '*[aeiáéí]r',
  '*[aeiáéí]r[mtsl][eoa]', '*[aeiáéí]r[mtsl][eoa]s', '*[aeiáéí]rnos',
  '*[aeiáéí]r[mts]e[lm][oa]', '*[aeiáéí]r[mts]e[lm][oa]s',
];

function slotSql(slot: Slot, word: string): string {
  if (slot === 'infinitive') return `(${INFINITIVE_GLOBS.map(g => `${word} GLOB '${g}'`).join(' OR ')})`;
  if ('is' in slot) return `${word} IN (${sqlList(slot.is)})`;
  return `${word} NOT IN (${sqlList(slot.not)})`;
}

/** Lines holding the words of `slots` back to back, anywhere in the line:
 *  Spanish drops the subject pronoun, so "Quiero comer" and "Yo quiero
 *  comer" both open the pattern at the verb, and a "no" before it ("No
 *  puedo ir") leaves it whole. */
function buildSpanishSequencePredicate(slots: Slot[]): string {
  const nest = (k: number): string => {
    const alias = `wt${k + 1}`;
    const word = ES_CLEAN.replace(/wt%/g, alias);
    const position = k === 0 ? '' : `\n        AND ${alias}.word_index = wt${k}.word_index + 1`;
    const inner = k + 1 < slots.length ? `\n        AND ${nest(k + 1)}` : '';
    return `EXISTS (
      SELECT 1 FROM word_timestamps ${alias}
      WHERE ${alias}.line_id = sl.id${position}
        AND ${slotSql(slots[k], word)}${inner}
    )`;
  };
  return `\n    AND ${nest(0)}`;
}

/** Spanish verb patterns past ser/estar, in path order. Each pairs the yo
 *  form with the tú form learners hear asked ("¿Quieres…?", "¿Puedes…?"),
 *  and each leaves out the look-alikes that mean something else: "Te
 *  quiero" (seni seviyorum), "Voy a la escuela" (going, not "-eceğim"),
 *  "Hay que…" (-mek lazım), "se" without its accent. */
const SPANISH_VERB_PATTERNS: Record<string, { label: string; slots: Slot[] }> = {
  'es-quiero': {
    label: 'Quiero / ¿Quieres? + fiil',
    slots: [{ is: ['quiero', 'quieres'] }, 'infinitive'],
  },
  'es-tengo': {
    label: 'Tengo / ¿Tienes? + isim',
    slots: [{ is: ['tengo', 'tienes'] }, { not: ['que'] }],
  },
  'es-tengo-que': {
    label: 'Tengo que / Tienes que + fiil',
    slots: [{ is: ['tengo', 'tienes'] }, { is: ['que'] }, 'infinitive'],
  },
  'es-puedo': {
    label: 'Puedo / ¿Puedes? + fiil',
    slots: [{ is: ['puedo', 'puedes'] }, 'infinitive'],
  },
  'es-voy-a': {
    label: 'Voy a / Vamos a + fiil',
    slots: [{ is: ['voy', 'vamos'] }, { is: ['a'] }, 'infinitive'],
  },
  'es-se': {
    label: '(No) sé / ¿Sabes?',
    slots: [{ is: ['sé', 'sabes'] }],
  },
  'es-hay': {
    label: 'Hay + isim',
    slots: [{ is: ['hay'] }, { not: ['que'] }],
  },
};

/** Maps a pattern.id (mirrors PatternCatalog ids in iOS) to the SQL
 *  predicate that picks subtitle lines matching that pattern. English
 *  covers the BE + adjective family — "I am +", "You are +" — and
 *  Spanish (`lang: 'es'`) the ser/estar + adjective family and the verb
 *  patterns above, leaving room for the rest as the demand surfaces. */
export const PATTERN_FILTERS: Record<string, PatternFilter> = {
  'be-adj-i': {
    label: 'I am + sıfat',
    // "I am happy" → I(0) am(1) happy(2)  |  "I'm happy" → I'm(0) happy(1)
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['i am '],
      fullSlotIndex: 2,
      contractionPrefixes: ["i'm "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-you': {
    label: 'You are + sıfat',
    // "You are kind" → You(0) are(1) kind(2)  |  "You're kind" → You're(0) kind(1)
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['you are '],
      fullSlotIndex: 2,
      contractionPrefixes: ["you're "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-hesheIt': {
    label: 'He/She/It is + sıfat',
    // Three subjects share the same slot positions. Full forms: He/She/It is X
    // → idx 2; contractions: He's/She's/It's X → idx 1.
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['he is ', 'she is ', 'it is '],
      fullSlotIndex: 2,
      contractionPrefixes: ["he's ", "she's ", "it's "],
      contractionSlotIndex: 1,
    }),
  },
  'be-adj-wethey': {
    label: 'We/They are + sıfat',
    // "We are happy" / "They are tired" → idx 2.
    // "We're happy" / "They're tired" → idx 1.
    sqlPredicate: buildBeAdjPredicate({
      fullPrefixes: ['we are ', 'they are '],
      fullSlotIndex: 2,
      contractionPrefixes: ["we're ", "they're "],
      contractionSlotIndex: 1,
    }),
  },

  // ── Spanish: ser/estar + adjective ──────────────────────────────
  'ser-estar-adj-yo': {
    label: 'Yo soy/estoy + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(COPULAS_BY_PATTERN['ser-estar-adj-yo']),
    lang: 'es',
  },
  'ser-estar-adj-tu': {
    label: 'Tú eres/estás + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(COPULAS_BY_PATTERN['ser-estar-adj-tu']),
    lang: 'es',
  },
  'ser-estar-adj-el': {
    label: 'Él/Ella es/está + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(COPULAS_BY_PATTERN['ser-estar-adj-el']),
    lang: 'es',
  },
  'ser-estar-adj-nosotros': {
    label: 'Nosotros somos/estamos + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(COPULAS_BY_PATTERN['ser-estar-adj-nosotros']),
    lang: 'es',
  },
  'ser-estar-adj-ellos': {
    label: 'Ellos/Ellas son/están + sıfat',
    sqlPredicate: buildCopulaAdjPredicate(COPULAS_BY_PATTERN['ser-estar-adj-ellos']),
    lang: 'es',
  },

  // ── Spanish: verb patterns ───────────────────────────────────────
  ...Object.fromEntries(Object.entries(SPANISH_VERB_PATTERNS).map(([id, p]) => [id, {
    label: p.label,
    sqlPredicate: buildSpanishSequencePredicate(p.slots),
    lang: 'es' as const,
  }])),
};

/** Spanish pattern ids, in path order: the patterns a Spanish clip line
 *  can be marked with. */
export const SPANISH_PATTERN_IDS = Object.keys(PATTERN_FILTERS).filter(id => PATTERN_FILTERS[id].lang === 'es');
