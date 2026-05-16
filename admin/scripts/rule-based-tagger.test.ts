/**
 * Tests the 3-bucket sentence-structure tagger against the rules the user
 * specified on 2026-05-02:
 *   - SUBJECT  : the subject NP of the main clause.
 *   - AUX_VERB : the predicate verb chunk = aux + neg/adverb between aux and
 *                main + main verb. Always non-empty for a finite clause —
 *                a bare main verb (no aux) goes here too. Linking "be"
 *                without a Ving/PP also goes here.
 *   - REST     : everything else (sentence-initial adverbs, objects,
 *                post-verb adverbs/PPs, the entire body of any
 *                subordinate clause).
 *
 * Subject-aux inversion (questions): token-level rules — subject stays in
 * SUBJECT even when it sits between two AUX_VERB tokens; we don't try to
 * keep buckets contiguous.
 *
 * Run: cd admin && npx tsx scripts/rule-based-tagger.test.ts
 */
import { tagSentence, Structure } from './rule-based-tagger';

let failed = 0;
let total = 0;

function arrEq(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function assertTag(
  text: string,
  expected: { subject: number[]; aux_verb: number[]; rest: number[] },
  label?: string,
): void {
  total++;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const got = tagSentence(words);
  const ok =
    arrEq(got.subject, expected.subject.slice().sort((a, b) => a - b)) &&
    arrEq(got.aux_verb, expected.aux_verb.slice().sort((a, b) => a - b)) &&
    arrEq(got.rest, expected.rest.slice().sort((a, b) => a - b));
  const tag = label ? `${label}: ` : '';
  if (ok) {
    console.log(`  ✓ ${tag}"${text}"`);
  } else {
    console.error(`  ✗ ${tag}"${text}"`);
    console.error(`      tokens:  ${words.map((w, i) => `${i}:${w}`).join('  ')}`);
    console.error(`      expect:  S=${JSON.stringify(expected.subject)}  V=${JSON.stringify(expected.aux_verb)}  R=${JSON.stringify(expected.rest)}`);
    console.error(`      got:     S=${JSON.stringify(got.subject)}  V=${JSON.stringify(got.aux_verb)}  R=${JSON.stringify(got.rest)}`);
    failed++;
  }
}

// ─── Q1: predicate verb chunk = the verb itself (with or without aux) ─────
console.log('Q1 — bare main verb / linking be:');
assertTag('I play basketball',                   { subject: [0],     aux_verb: [1],       rest: [2] });
assertTag('She is happy',                        { subject: [0],     aux_verb: [1],       rest: [2] });
assertTag('He went home',                        { subject: [0],     aux_verb: [1],       rest: [2] });
assertTag('They eat lunch',                      { subject: [0],     aux_verb: [1],       rest: [2] });
assertTag('We watched the movie',                { subject: [0],     aux_verb: [1],       rest: [2, 3] });

// ─── Q2: post-verb adverbs / PPs stay in REST ─────────────────────────────
console.log('Q2 — adverbs/PPs after main verb fall in REST:');
assertTag("he doesn't play well with others",    { subject: [0],     aux_verb: [1, 2],    rest: [3, 4, 5] });
assertTag('She runs fast',                       { subject: [0],     aux_verb: [1],       rest: [2] });
assertTag('I sleep at night',                    { subject: [0],     aux_verb: [1],       rest: [2, 3] });

// ─── Q3: negation / adverbs BETWEEN aux and main verb stay with the verb ─
console.log('Q3 — negation/adverbs between aux and main verb go with the verb:');
assertTag('I am not feeling alright',            { subject: [0],     aux_verb: [1, 2, 3], rest: [4] });
assertTag('I have always loved you',             { subject: [0],     aux_verb: [1, 2, 3], rest: [4] });
assertTag('She has not been working',            { subject: [0],     aux_verb: [1, 2, 3, 4], rest: [] });
assertTag('I am gonna need the passport',        { subject: [0],     aux_verb: [1, 2, 3], rest: [4, 5] });

// ─── Q4: subject-aux inversion — token-level, buckets may be split ───────
console.log('Q4 — questions with subject-aux inversion (token-level rules):');
assertTag('Do you like pizza?',                  { subject: [1],     aux_verb: [0, 2],    rest: [3] });
assertTag('Where do I buy the Nike shoes?',      { subject: [2],     aux_verb: [1, 3],    rest: [0, 4, 5, 6] });
assertTag('Did she leave?',                      { subject: [1],     aux_verb: [0, 2],    rest: [] });

// ─── Q5: subordinate clauses fall entirely in REST ───────────────────────
console.log('Q5 — only the main clause is tagged:');
assertTag("I don't think you get it.",           { subject: [0],     aux_verb: [1, 2],    rest: [3, 4, 5] });
assertTag('I know that he went home',            { subject: [0],     aux_verb: [1],       rest: [2, 3, 4, 5] });
assertTag('She said she was tired',              { subject: [0],     aux_verb: [1],       rest: [2, 3, 4] });

// ─── Smoke checks for fragments / no-verb lines ──────────────────────────
console.log('Edge — fragments and verbless lines:');
assertTag('Cricogia!',                           { subject: [],      aux_verb: [],        rest: [0] });
assertTag('No, no.',                             { subject: [],      aux_verb: [],        rest: [0, 1] });

// ─── Real-world DB regressions found after first run ─────────────────────
// These are common patterns the tagger has been DROPPING entirely (no
// subject + no verb), which is worse than partial tagging.
console.log('Regression — leading interjections / vocatives:');
// "Yeah, Scott's tape would work!"  → main = "Scott's tape would work"
assertTag("Yeah, Scott's tape would work!",      { subject: [1, 2],  aux_verb: [3, 4],    rest: [0] });
// "Well, yeah, Kevin was Pam's fiancé."  → main = "Kevin was Pam's fiancé"
assertTag("Well, yeah, Kevin was Pam's fiancé.", { subject: [2],     aux_verb: [3],       rest: [0, 1, 4, 5] });
// "Peter, that is everything."  → vocative + main = "that is everything"
assertTag('Peter, that is everything.',          { subject: [1],     aux_verb: [2],       rest: [0, 3] });
// "And no, he can't work."  → conjunction + interjection + main = "he can't work"
assertTag("And no, he can't work.",              { subject: [2],     aux_verb: [3, 4],    rest: [0, 1] });

console.log('Regression — imperatives (no subject, but tag the verb):');
// "Please follow me."  →  please(REST), follow(VERB), me(REST)
assertTag('Please follow me.',                   { subject: [],      aux_verb: [1],       rest: [0, 2] });
// "Hang in there."
assertTag('Hang in there.',                      { subject: [],      aux_verb: [0],       rest: [1, 2] });

console.log('Regression — bare-noun multi-word subjects:');
// "Republic of Cricogia is under new leadership."  → "Republic of Cricogia" is subject
assertTag('Republic of Cricogia is under new leadership.', { subject: [0, 1, 2], aux_verb: [3], rest: [4, 5, 6] });
// "Water has memory."
assertTag('Water has memory.',                   { subject: [0],     aux_verb: [1],       rest: [2] });

console.log('Regression — subordinate-clause-only sentences:');
// "Because Amal wouldn't give him the family ring."  → no main clause;
// fall back to tagging the only clause we have.
assertTag("Because Amal wouldn't give him the family ring.",
  { subject: [1], aux_verb: [2, 3], rest: [0, 4, 5, 6, 7] });

console.log('');
if (failed === 0) {
  console.log(`All ${total} tagger tests passed.`);
  process.exit(0);
} else {
  console.error(`${failed}/${total} tagger tests FAILED.`);
  process.exit(1);
}
