// Spanish content pipeline: WhisperX output → subtitle lines → scenes.
//
//   npx tsx --test tests/es-lines.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { playableScenes, toLines, toScenes, type Line } from '../scripts/es/lib/lines';

const w = (word: string, start: number | null, end: number | null, score = 0.8) => ({ word, start, end, score });

test('a segment with two sentences becomes two lines timed by their words', () => {
  const lines = toLines([
    { text: 'Hola. ¿Cómo estás?', start: 0, end: 9, words: [w('Hola.', 1, 1.4), w('¿Cómo', 1.6, 1.9), w('estás?', 1.9, 2.4)] },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['Hola.', '¿Cómo estás?']);
  // The segment's own end (9s, silence included) is not the line's end.
  assert.deepEqual(lines.map(l => [l.start, l.end]), [[1, 1.4], [1.6, 2.4]]);
  assert.deepEqual(lines[1].words.map(x => x.word), ['¿Cómo', 'estás?']);
});

test('untimed words get times between their neighbours, so the text stays whole', () => {
  const [line] = toLines([
    { text: 'Tengo 5 años.', start: 0, end: 3, words: [w('Tengo', 0, 0.5), w('5', null, null, 0), w('años.', 1.5, 2)] },
  ]);
  assert.equal(line.text, 'Tengo 5 años.');
  assert.deepEqual(line.words.map(x => [x.start, x.end]), [[0, 0.5], [0.5, 1.5], [1.5, 2]]);
});

test('a long pause or a segment boundary ends a line', () => {
  const lines = toLines([
    { text: 'Mira el perro', start: 0, end: 5, words: [w('Mira', 0, 0.3), w('el', 0.3, 0.4), w('perro', 3, 3.4)] },
    { text: 'Qué bonito', start: 5, end: 6, words: [w('Qué', 5, 5.2), w('bonito', 5.2, 5.6)] },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['Mira el', 'perro', 'Qué bonito']);
});

test('a sentence WhisperX splits across two segments stays one line', () => {
  // "¡Está | entrenado!": no sentence end before the boundary, and the next
  // segment carries on in lowercase.
  const lines = toLines([
    { text: '¡Está', start: 0, end: 1, words: [w('¡Está', 0.2, 0.6)] },
    { text: 'entrenado!', start: 1, end: 2, words: [w('entrenado!', 0.7, 1.3)] },
    { text: 'Bueno, ya', start: 2, end: 3, words: [w('Bueno,', 2, 2.3), w('ya', 2.4, 2.6)] },
    { text: 'me tengo que ir.', start: 3, end: 4, words: [w('me', 2.7, 2.8), w('tengo', 2.8, 3.1), w('que', 3.1, 3.2), w('ir.', 3.2, 3.5)] },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['¡Está entrenado!', 'Bueno, ya me tengo que ir.']);
});

test('a pause that YouTube does not hear does not split a sentence', () => {
  // WhisperX puts 3 s between "¡Está" and "entrenado!"; the captions have
  // them back to back, so the pause was WhisperX's, not the speaker's.
  const lines = toLines(
    [{ text: '¡Está entrenado!', start: 0, end: 4, words: [w('¡Está', 0.2, 0.6), w('entrenado!', 3.6, 4)] }],
    { captions: { events: [{ tStartMs: 200, segs: [{ utf8: 'está' }, { utf8: ' entrenado', tOffsetMs: 500 }] }] } },
  );
  assert.deepEqual(lines.map(l => l.text), ['¡Está entrenado!']);
});

test('a run-on sentence is cut at a comma', () => {
  const words = 'Uno, dos tres cuatro cinco seis siete ocho, nueve diez once doce trece catorce quince dieciséis diecisiete.'
    .split(' ').map((t, i) => w(t, i * 0.3, i * 0.3 + 0.25));
  const lines = toLines([{ text: '', start: 0, end: 10, words }]);
  assert.ok(lines.every(l => l.words.length <= 14), lines.map(l => l.words.length).join(','));
  assert.equal(lines[0].text.endsWith('ocho,'), true);
});

test('a long sentence without a comma is cut in half, not one word from its end', () => {
  const words = 'Ahora ha llegado el momento para el que me he preparado durante toda mi vida.'
    .split(' ').map((t, i) => w(t, i * 0.3, i * 0.3 + 0.25));
  const lines = toLines([{ text: '', start: 0, end: 5, words }]);
  assert.deepEqual(lines.map(l => l.words.length), [8, 7]);
});

test('known Whisper hallucinations are dropped', () => {
  const lines = toLines([
    { text: 'Adiós.', start: 0, end: 1, words: [w('Adiós.', 0, 0.6)] },
    { text: 'Subtítulos realizados por la comunidad de Amara.org', start: 2, end: 4,
      words: 'Subtítulos realizados por la comunidad de Amara.org'.split(' ').map((t, i) => w(t, 2 + i * 0.2, 2.15 + i * 0.2)) },
    { text: 'Gracias por ver el video.', start: 5, end: 6,
      words: 'Gracias por ver el video.'.split(' ').map((t, i) => w(t, 5 + i * 0.2, 5.15 + i * 0.2)) },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['Adiós.']);
});

test('with captions, words start where YouTube hears them, on the video clock, in WhisperX words', () => {
  // The audio window starts 100 s into the video: WhisperX's times are the
  // window's, the captions' the video's. YouTube heard "están", not "estás".
  const lines = toLines(
    [{ text: 'Hola, ¿cómo estás?', start: 0, end: 3, words: [w('Hola,', 1, 1.3), w('¿cómo', 1.4, 1.6), w('estás?', 1.7, 2.1)] }],
    { offset: 100, captions: { events: [{ tStartMs: 101300, segs: [{ utf8: 'hola,' }, { utf8: ' cómo', tOffsetMs: 400 }, { utf8: ' están', tOffsetMs: 700 }] }] } },
  );
  assert.deepEqual(lines.map(l => l.text), ['Hola, ¿cómo estás?']);
  // "estás?" moves with the pair before it; each word runs on to the next.
  assert.deepEqual(lines[0].words.map(x => [x.start, x.end]), [[101.3, 101.7], [101.7, 102], [102, 102.4]]);
});

function line(start: number, end: number): Line {
  return { text: 'x', start, end, words: [{ word: 'x', start, end, score: 1 }] };
}

test('scenes run 60-150 s, cut at a pause, and a short tail joins the last scene', () => {
  // A line every 4 s for 400 s, with a 3 s pause after the line at 92 s.
  const lines: Line[] = [];
  for (let t = 0; t < 400; t += 4) lines.push(line(t, t + (t === 92 ? 1 : 3)));
  const scenes = toScenes(lines);
  for (const s of scenes) {
    const d = s[s.length - 1].end - s[0].start;
    assert.ok(d >= 60 && d <= 150, `scene of ${d}s`);
  }
  assert.equal(scenes[0][scenes[0].length - 1].start, 92, 'first cut after the pause');
  assert.equal(scenes.flat().length, lines.length, 'no line lost');
});

test('a scene with too little dialogue for the set player is left out', () => {
  // 70 s of action with 5 lines, then a 60 s stretch of steady talk.
  const lines: Line[] = [];
  for (const t of [0, 15, 30, 45, 60]) lines.push(line(t, t + 2));
  for (let t = 100; t < 160; t += 4) lines.push(line(t, t + 3));
  const scenes = playableScenes(toScenes(lines));
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0][0].start, 100);
  assert.ok(scenes.every(s => s.length >= 8));
});

test('a long silence ends a scene, and a stray line at its edge is dropped', () => {
  // A lone "Gracias." at 0 s, 60 s of action, then steady talk for 70 s
  // ending in one line left after a 20 s pause.
  const lines: Line[] = [line(0, 1)];
  for (let t = 61; t < 131; t += 4) lines.push(line(t, t + 3));
  lines.push(line(154, 155));
  const scenes = toScenes(lines);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0][0].start, 61, 'the lone line before the silence is gone');
  assert.equal(scenes[0][scenes[0].length - 1].start, 129, 'so is the one after the last pause');
});

test('a scene keeps a pause that is part of the action', () => {
  // 30 s of talk, a 20 s chase, 30 s of talk: one scene, nothing dropped.
  const lines: Line[] = [];
  for (let t = 0; t < 30; t += 3) lines.push(line(t, t + 2));
  for (let t = 50; t < 80; t += 3) lines.push(line(t, t + 2));
  const scenes = toScenes(lines);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].length, lines.length);
});

test('a scene too short to follow is left out', () => {
  // Eight quick lines in 16 s: enough dialogue, but over before it starts.
  const quick: Line[] = [];
  for (let t = 0; t < 16; t += 2) quick.push(line(t, t + 1.5));
  assert.deepEqual(playableScenes([quick]), []);
});
