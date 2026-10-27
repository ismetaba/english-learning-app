// Spanish subtitles must follow the video they play over. The user saw
// them drift "in some places, not everywhere". WhisperX's word timings
// break in two ways:
//   - a line's first word swallows the pause before it, so the subtitle
//     shows up to 2.5 s before the line is spoken ("Ahora" at 6.4 s, heard
//     at 7.8 s);
//   - around music, whole lines land seconds away from their audio
//     ("No podría ser más increíble, Ana" at 196.9 s, heard at 216.2 s).
// YouTube's own Spanish captions (json3, word onsets) are timed against
// the very video the app embeds, so they are the reference here.
//
// Fixtures (tests/fixtures/es-timing/): the WhisperX output the pipeline
// starts from, and YouTube's auto captions (es-orig) for the Frozen clip
// p4NOnmGN5Ws (the worst: 15% of words off by >0.5 s) and Enredados
// 2M4HROpx2hY (14%).
//
//   npx tsx --test tests/es-timing.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toLines, type Line } from '../scripts/es/lib/lines';

const dir = path.join(__dirname, 'fixtures', 'es-timing');
const whisper = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.whisper.json`), 'utf8')).segments;
const captions = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.captions.json3`), 'utf8'));

const norm = (w: string) => w.toLocaleLowerCase('es').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Word onsets in YouTube's caption timeline. */
function referenceWords(json3: { events?: { tStartMs?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[] }) {
  const out: { w: string; t: number }[] = [];
  for (const e of json3.events ?? []) {
    for (const s of e.segs ?? []) {
      for (const tok of (s.utf8 ?? '').split(/\s+/)) {
        const w = norm(tok);
        if (w) out.push({ w, t: ((e.tStartMs ?? 0) + (s.tOffsetMs ?? 0)) / 1000 });
      }
    }
  }
  return out;
}

/** Pairs each line word with the reference word it is (longest common
 *  subsequence of the normalized word streams). */
function matchToReference(lines: Line[], ref: { w: string; t: number }[]) {
  const ours = lines.flatMap((l, li) => l.words.map((w, wi) => ({ w: norm(w.word), start: w.start, li, wi })))
    .filter(x => x.w);
  const n = ours.length, m = ref.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ours[i].w === ref[j].w ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: { li: number; wi: number; ours: number; ref: number }[] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ours[i].w === ref[j].w) { pairs.push({ li: ours[i].li, wi: ours[i].wi, ours: ours[i].start, ref: ref[j].t }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { pairs, total: n };
}

for (const id of ['p4NOnmGN5Ws', '2M4HROpx2hY']) {
  test(`${id}: with YouTube's captions, words are timed where they are heard`, () => {
    const lines = toLines(whisper(id), { captions: captions(id) });
    const end = lines[lines.length - 1].end + 5;
    const { pairs, total } = matchToReference(lines, referenceWords(captions(id)).filter(r => r.t <= end));
    assert.ok(pairs.length >= total * 0.85, `only ${pairs.length}/${total} words matched the reference`);

    const off = pairs.filter(p => Math.abs(p.ours - p.ref) > 0.5);
    assert.ok(off.length <= pairs.length * 0.05,
      `${off.length}/${pairs.length} words are >0.5 s from where YouTube hears them, e.g. ` +
      off.slice(0, 4).map(p => `"${lines[p.li].words[p.wi].word}" ${p.ours.toFixed(1)}s vs ${p.ref.toFixed(1)}s`).join(', '));

    // A line appears when its first word is heard, not seconds before.
    const lateOrEarly = lines.flatMap((l, li) => {
      const first = pairs.find(p => p.li === li && p.wi === 0);
      return first && Math.abs(l.start - first.ref) > 1.0 ? [`"${l.text}" at ${l.start.toFixed(1)}s, heard ${first.ref.toFixed(1)}s`] : [];
    });
    assert.deepEqual(lateOrEarly, []);
  });
}

test('without captions, a line does not start in the silence before its first word', () => {
  // WhisperX stretches a line's first word back over the pause before it:
  // "¡Ay!" 3.0-5.0 s (heard at 4.8 s), "Ahora" 6.4-8.0 s (heard at 7.8 s).
  // Even a slowly spoken first word is not that long.
  const lines = toLines(whisper('p4NOnmGN5Ws'));
  const stretched = lines
    .map(l => ({ l, w: l.words[0] }))
    .filter(({ w }) => w.end - w.start > Math.max(0.8, 0.12 * norm(w.word).length))
    .map(({ l, w }) => `"${w.word}" ${(w.end - w.start).toFixed(1)}s in "${l.text}"`);
  assert.deepEqual(stretched, []);
});
