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

// The user still saw words "missed now and then". A measurement against
// two independent references (wav2vec2 forced alignment of each line on
// its own audio, and faster-whisper's word times; 1,160 lines of the live
// set) found the captions themselves mislead the retiming in three ways.
// Fixtures in tests/fixtures/es-timing/<case>/, cut from the real sources;
// expected times are where both references agree.

function excerpt(name: string, offset: number) {
  const d = path.join(dir, name);
  return toLines(JSON.parse(fs.readFileSync(path.join(d, 'whisper.json'), 'utf8')).segments, {
    captions: JSON.parse(fs.readFileSync(path.join(d, 'captions.json3'), 'utf8')),
    offset,
  });
}
function wordOf(lines: Line[], text: string, w: string) {
  const l = lines.find(x => x.text === text);
  assert.ok(l, `no line "${text}"`);
  const x = l.words.find(y => y.word === w);
  assert.ok(x, `no "${w}" in "${text}"`);
  return x;
}
function startsNear(lines: Line[], text: string, w: string, at: number, tol: number) {
  const s = wordOf(lines, text, w).start;
  assert.ok(Math.abs(s - at) <= tol, `"${w}" in "${text}" starts at ${s.toFixed(2)} s, heard at ${at} s`);
}

test('a caption word stamped one second before the next is not where it is said', () => {
  // YouTube stamps a word after a pause exactly 1.000 s before the next
  // one (5% of caption gaps); "Es" at 0.73 is heard at 1.66, "Sino" at
  // 7.55 at 8.30. WhisperX had both right.
  const lines = excerpt('caption-1s-before-next', 0);
  startsNear(lines, 'Es curioso, supongo que el destino no es la senda que se nos da.', 'Es', 1.66, 0.25);
  startsNear(lines, 'Sino la senda que uno elige para sí mismo.', 'Sino', 8.30, 0.25);
});

test('words before the first caption pair keep their own spacing', () => {
  // The first pair ("tengo", a one-second stamp) pulled the words before
  // it 0.6 s earlier, and the clamp at 0 s stacked "No, no, no." on 0.
  const lines = excerpt('clamp-before-first-pair', 0);
  const no = lines.find(l => l.text === 'No, no, no.')!.words.map(w => w.start);
  for (let i = 1; i < no.length; i++) {
    assert.ok(no[i] - no[i - 1] >= 0.1, `"No, no, no." starts ${no.map(s => s.toFixed(2)).join(', ')}`);
  }
  startsNear(lines, 'Tengo un jardín lleno de estas niñitas.', 'Tengo', 2.96, 0.25);
});

test('two words in one caption segment do not start together', () => {
  // json3 holds " lugar de" as one segment with one onset; both words got
  // 122.82 and "lugar" was never highlighted (heard 122.33 and 122.69).
  const lines = excerpt('multi-word-caption-seg', 0);
  const t = 'Y a veces, yo como en lugar de enfrentar mis problemas.';
  assert.ok(wordOf(lines, t, 'de').start - wordOf(lines, t, 'lugar').start >= 0.1);
});

test('under music, lyric words that happen to match do not move the dialogue', () => {
  // The captions there are the song; "a" and "por" paired 7-8 s away and
  // dragged the unpaired words with them. WhisperX had both right.
  const lines = excerpt('music-coincidental-pairs', 48);
  startsNear(lines, '¿Quién se puso los cuernos?', 'se', 92.38, 0.25);
  startsNear(lines, '¿A qué horas vas por el pan?', '¿A', 51.16, 0.5);
});

test('where WhisperX drifted, the captions that agree with each other time the line', () => {
  // Buscando a Dory "¡Manos!": WhisperX put "Perdón por no poderme
  // acordarte." at 125.0 s, 6.5 s early (all its words around there drift
  // alike). The captions, the forced alignment of the line (131.55, 132.11,
  // 132.37, 132.65) and faster-whisper (131.08, 131.98, 132.20, 132.46)
  // agree it is said from 131.1 s; the first fix fell back to WhisperX.
  const lines = excerpt('whisperx-drift', 0);
  const t = 'Perdón por no poderme acordarte.';
  startsNear(lines, t, 'Perdón', 131.35, 0.4);
  startsNear(lines, t, 'por', 132.0, 0.3);
  startsNear(lines, t, 'no', 132.25, 0.3);
  startsNear(lines, t, 'poderme', 132.5, 0.3);
});

test('every word is highlighted: after the one before it, for at least 80 ms', () => {
  // The app highlights a word from its start until the next word starts
  // (the last word: until its end). 26 words across these fixtures were
  // held under 80 ms or started with the word before them, so they never
  // showed.
  const all: [string, Line[]][] = [
    ...['p4NOnmGN5Ws', '2M4HROpx2hY'].map(id => [id, toLines(whisper(id), { captions: captions(id) })] as [string, Line[]]),
    ['caption-1s-before-next', excerpt('caption-1s-before-next', 0)],
    ['clamp-before-first-pair', excerpt('clamp-before-first-pair', 0)],
    ['multi-word-caption-seg', excerpt('multi-word-caption-seg', 0)],
    ['music-coincidental-pairs', excerpt('music-coincidental-pairs', 48)],
    ['whisperx-drift', excerpt('whisperx-drift', 0)],
  ];
  const unseen = all.flatMap(([name, lines]) => lines.flatMap(l => l.words.flatMap((w, i) => {
    const until = i + 1 < l.words.length ? l.words[i + 1].start : w.end;
    return until - w.start < 0.08 ? [`${name} "${w.word}" in "${l.text}" (${(until - w.start).toFixed(2)} s)`] : [];
  })));
  assert.deepEqual(unseen, []);
});
