/**
 * English inflection expansion for A2-starter lemma matching.
 *
 * Given a lemma and its part of speech, returns the set of likely surface
 * forms a Whisper-tokenized word_timestamps row could carry. We pre-bake
 * irregulars (think → thought, feel → felt, ...) and apply orthographic
 * rules for the regular cases (stop → stopped, try → tried, family →
 * families, ...).
 *
 * This is a small, hand-tuned helper rather than a full morphology library
 * because we only need to cover ~50 lemmas. Add new entries to the
 * IRREGULAR_* maps as the starter set grows. Tests live alongside in
 * inflections.test.ts.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
// Letters that we don't double when applying the C-V-C consonant-doubling
// rule (so "new" → "newer", not "newwer").
const NO_DOUBLE_LAST = new Set(['w', 'x', 'y']);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

/** Word ends in single consonant preceded by single vowel preceded by consonant.
 *  Used for the "stop → stopped" doubling rule. */
function isCVC(word: string): boolean {
  if (word.length < 3) return false;
  const a = word[word.length - 3];
  const b = word[word.length - 2];
  const c = word[word.length - 1];
  return !isVowel(a) && isVowel(b) && !isVowel(c) && !NO_DOUBLE_LAST.has(c);
}

const IRREGULAR_VERB_FORMS: Record<string, string[]> = {
  think:      ['think', 'thinks', 'thinking', 'thought'],
  know:       ['know', 'knows', 'knowing', 'knew', 'known'],
  feel:       ['feel', 'feels', 'feeling', 'felt'],
  find:       ['find', 'finds', 'finding', 'found'],
  forget:     ['forget', 'forgets', 'forgetting', 'forgot', 'forgotten'],
  understand: ['understand', 'understands', 'understanding', 'understood'],
  read:       ['read', 'reads', 'reading'], // past tense spelled "read" too
  run:        ['run', 'runs', 'running', 'ran'],
};

const IRREGULAR_ADJ_FORMS: Record<string, string[]> = {
  good: ['good', 'better', 'best'],
};

const IRREGULAR_NOUN_FORMS: Record<string, string[]> = {
  life: ['life', 'lives'],
};

function regularVerbForms(v: string): string[] {
  const out = new Set<string>([v]);

  // 3rd-person singular
  if (v.endsWith('y') && !isVowel(v[v.length - 2])) {
    out.add(v.slice(0, -1) + 'ies');
  } else if (/(s|x|z|ch|sh|o)$/.test(v)) {
    out.add(v + 'es');
  } else {
    out.add(v + 's');
  }

  // Past + present-participle
  if (v.endsWith('e')) {
    out.add(v + 'd');
    out.add(v.slice(0, -1) + 'ing');
  } else if (v.endsWith('y') && !isVowel(v[v.length - 2])) {
    out.add(v.slice(0, -1) + 'ied');
    out.add(v + 'ing');
  } else if (isCVC(v)) {
    // Doubled forms (stop → stopped). Multi-syllable CVC verbs without
    // final-syllable stress (listen, remember, happen) actually don't double,
    // and we have no stress info — so emit both candidates. The non-doubled
    // alternative wastes a few entries on impossible forms (e.g. "stoped")
    // that never match real subtitle text, which is harmless.
    const doubled = v + v[v.length - 1];
    out.add(doubled + 'ed');
    out.add(doubled + 'ing');
    out.add(v + 'ed');
    out.add(v + 'ing');
  } else {
    out.add(v + 'ed');
    out.add(v + 'ing');
  }
  return [...out];
}

function regularAdjForms(a: string): string[] {
  const out = new Set<string>([a]);
  if (a.endsWith('y') && !isVowel(a[a.length - 2])) {
    out.add(a.slice(0, -1) + 'ier');
    out.add(a.slice(0, -1) + 'iest');
  } else if (a.endsWith('e')) {
    out.add(a + 'r');
    out.add(a + 'st');
  } else if (isCVC(a)) {
    const doubled = a + a[a.length - 1];
    out.add(doubled + 'er');
    out.add(doubled + 'est');
  } else {
    out.add(a + 'er');
    out.add(a + 'est');
  }
  return [...out];
}

function regularNounForms(n: string): string[] {
  const out = new Set<string>([n]);
  if (n.endsWith('y') && !isVowel(n[n.length - 2])) {
    out.add(n.slice(0, -1) + 'ies');
  } else if (/(s|x|z|ch|sh|o)$/.test(n)) {
    out.add(n + 'es');
  } else {
    out.add(n + 's');
  }
  return [...out];
}

export type Pos = 'verb' | 'adj' | 'noun';

export function expandInflections(lemma: string, pos: Pos): string[] {
  const lower = lemma.toLowerCase();
  if (pos === 'verb') return IRREGULAR_VERB_FORMS[lower] ?? regularVerbForms(lower);
  if (pos === 'adj')  return IRREGULAR_ADJ_FORMS[lower]  ?? regularAdjForms(lower);
  if (pos === 'noun') return IRREGULAR_NOUN_FORMS[lower] ?? regularNounForms(lower);
  return [lower];
}
