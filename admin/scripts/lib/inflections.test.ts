/**
 * Smoke tests for inflection expansion. Not a real test framework — just runs
 * a handful of assertions and exits non-zero if any fails.
 *
 * Run: cd admin && npx tsx scripts/lib/inflections.test.ts
 */
import { expandInflections } from './inflections';

let failed = 0;
let total = 0;

function assertContains(forms: string[], expected: string[], label: string) {
  total++;
  const missing = expected.filter(e => !forms.includes(e));
  if (missing.length > 0) {
    console.error(`  ✗ ${label}: missing [${missing.join(', ')}]; got [${forms.join(', ')}]`);
    failed++;
  } else {
    console.log(`  ✓ ${label}: ${forms.join(', ')}`);
  }
}

console.log('Verbs (regular):');
assertContains(expandInflections('walk', 'verb'),    ['walk', 'walks', 'walked', 'walking'],     'walk');
assertContains(expandInflections('like', 'verb'),    ['like', 'likes', 'liked', 'liking'],       'like (e-ending)');
assertContains(expandInflections('try', 'verb'),     ['try', 'tries', 'tried', 'trying'],        'try (y-ending)');
assertContains(expandInflections('play', 'verb'),    ['play', 'plays', 'played', 'playing'],     'play (vowel-y)');
assertContains(expandInflections('stop', 'verb'),    ['stop', 'stops', 'stopped', 'stopping'],   'stop (CVC double)');
assertContains(expandInflections('start', 'verb'),   ['start', 'starts', 'started', 'starting'], 'start (no double)');
assertContains(expandInflections('change', 'verb'),  ['change', 'changes', 'changed', 'changing'], 'change');
assertContains(expandInflections('listen', 'verb'),  ['listen', 'listens', 'listened', 'listening'], 'listen');

console.log('\nVerbs (irregular):');
assertContains(expandInflections('think', 'verb'),      ['think', 'thinks', 'thinking', 'thought'],         'think');
assertContains(expandInflections('know', 'verb'),       ['know', 'knows', 'knowing', 'knew', 'known'],      'know');
assertContains(expandInflections('feel', 'verb'),       ['feel', 'feels', 'feeling', 'felt'],               'feel');
assertContains(expandInflections('find', 'verb'),       ['find', 'finds', 'finding', 'found'],              'find');
assertContains(expandInflections('forget', 'verb'),     ['forget', 'forgets', 'forgetting', 'forgot', 'forgotten'], 'forget');
assertContains(expandInflections('understand', 'verb'), ['understand', 'understands', 'understanding', 'understood'], 'understand');
assertContains(expandInflections('run', 'verb'),        ['run', 'runs', 'running', 'ran'],                  'run');

console.log('\nAdjectives:');
assertContains(expandInflections('good', 'adj'),  ['good', 'better', 'best'],     'good (irregular)');
assertContains(expandInflections('happy', 'adj'), ['happy', 'happier', 'happiest'], 'happy (y-ending)');
assertContains(expandInflections('nice', 'adj'),  ['nice', 'nicer', 'nicest'],     'nice (e-ending)');
assertContains(expandInflections('sad', 'adj'),   ['sad', 'sadder', 'saddest'],    'sad (CVC double)');
assertContains(expandInflections('new', 'adj'),   ['new', 'newer', 'newest'],      'new (w-ending no double)');

console.log('\nNouns:');
assertContains(expandInflections('friend', 'noun'),  ['friend', 'friends'],   'friend');
assertContains(expandInflections('family', 'noun'),  ['family', 'families'],  'family (y-ending)');
assertContains(expandInflections('life', 'noun'),    ['life', 'lives'],       'life (irregular)');
assertContains(expandInflections('story', 'noun'),   ['story', 'stories'],    'story');

console.log(`\n${total - failed}/${total} passed.`);
if (failed > 0) {
  process.exit(1);
}
