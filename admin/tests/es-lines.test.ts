// Spanish content pipeline: WhisperX output → subtitle lines → scenes.
//
//   npx tsx --test tests/es-lines.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { toLines, toScenes, type Line } from '../scripts/es/lib/lines';

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
    { text: 'qué bonito', start: 5, end: 6, words: [w('qué', 5, 5.2), w('bonito', 5.2, 5.6)] },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['Mira el', 'perro', 'qué bonito']);
});

test('a run-on sentence is cut at a comma', () => {
  const words = 'Uno, dos tres cuatro cinco seis siete ocho, nueve diez once doce trece catorce quince dieciséis diecisiete.'
    .split(' ').map((t, i) => w(t, i * 0.3, i * 0.3 + 0.25));
  const lines = toLines([{ text: '', start: 0, end: 10, words }]);
  assert.ok(lines.every(l => l.words.length <= 14), lines.map(l => l.words.length).join(','));
  assert.equal(lines[0].text.endsWith('ocho,'), true);
});

test('known Whisper hallucinations are dropped', () => {
  const lines = toLines([
    { text: 'Adiós.', start: 0, end: 1, words: [w('Adiós.', 0, 0.6)] },
    { text: 'Subtítulos realizados por la comunidad de Amara.org', start: 2, end: 4,
      words: 'Subtítulos realizados por la comunidad de Amara.org'.split(' ').map((t, i) => w(t, 2 + i * 0.2, 2.15 + i * 0.2)) },
  ]);
  assert.deepEqual(lines.map(l => l.text), ['Adiós.']);
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
