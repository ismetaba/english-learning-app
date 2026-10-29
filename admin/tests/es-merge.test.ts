// Adding new sources to the live Spanish set (scripts/es/merge-content.ts):
// live's speed order stays as it is, each new source goes where its speed
// fits, and the sets are cut as build-content.ts cuts them.
//
//   npx tsx --test tests/es-merge.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutSets, orderSources } from '../scripts/es/merge-content';

test('a new source goes in before the first live source faster than it', () => {
  const wpm = new Map([['a', 100], ['b', 120], ['c', 140], ['n1', 130], ['n2', 90]]);
  assert.deepEqual(orderSources(['a', 'b', 'c'], ['n1', 'n2'], wpm), ['n2', 'a', 'b', 'n1', 'c']);
});

test("live's order stands even where its speeds are out of order", () => {
  // Live was ordered by each source's whole transcript; its kept lines can
  // measure a little differently.
  const wpm = new Map([['a', 100], ['b', 98], ['c', 140], ['n', 99]]);
  assert.deepEqual(orderSources(['a', 'b', 'c'], ['n'], wpm), ['n', 'a', 'b', 'c']);
});

test('a source faster than all of live comes last', () => {
  const wpm = new Map([['a', 100], ['n', 200]]);
  assert.deepEqual(orderSources(['a'], ['n'], wpm), ['a', 'n']);
});

test('sets close at 22 scenes, never split a source, and a small last set joins the one before', () => {
  const scenes = new Map([['a', 15], ['b', 9], ['c', 20], ['d', 5]]);
  const of = (yt: string) => Array.from({ length: scenes.get(yt)! }, (_, i) => `${yt}-${i + 1}`);
  const sets = cutSets(['a', 'b', 'c', 'd'], of);
  assert.deepEqual(sets.map(s => s.length), [24, 25]);
  assert.deepEqual(sets[0].slice(-1), ['b-9']);
  assert.deepEqual(sets[1].slice(0, 1), ['c-1']);
});

test('a last set of 10 or more stands on its own', () => {
  const sets = cutSets(['a', 'b'], yt => Array.from({ length: yt === 'a' ? 22 : 10 }, (_, i) => `${yt}-${i}`));
  assert.deepEqual(sets.map(s => s.length), [22, 10]);
});
