// Pattern-first sets: the Spanish learner learns a pattern, then watches
// the scenes that use it. One set per pattern of the path: its scenes
// (most lines of the pattern first, then those that also repeat earlier
// patterns, then the slowest), how many target lines each has, and the
// words the pattern adds to the learner's words.
//
//   npx tsx --test tests/es-pattern-sets.test.ts
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { LEGACY_SCHEMA } from './fixtures/legacy-schema';

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'es-pattern-sets-test-')), 'fixture.db');
process.env.DATABASE_PATH = dbPath;
{
  const db = new Database(dbPath);
  db.exec(LEGACY_SCHEMA);
  db.close();
}

/** Scene id, its clip's wpm, and its lines. A word written "comer*" is
 *  linked to the starter word a2-es-comer. */
const SCENES: [string, number, string[]][] = [
  ['es-a', 120, ['Quiero comer*.', 'Quiero ir a casa*.', 'Estoy feliz*.']],
  ['es-b', 100, ['Quiero jugar.', 'Tengo una idea*.']],
  ['es-c', 90, ['Quiero volar.', '¿Quieres bailar?']],
  ['es-d', 80, ['Hola, amigo*.']],
  // A line of the first pattern that also says "quiero".
  ['es-e', 110, ['Estoy listo, quiero ir.']],
];
const STARTER = (w: string) => `a2-es-${w.toLowerCase().replace(/[^a-záéíóúñ]/g, '')}`;

before(async () => {
  const { getDb } = await import('../lib/db');
  const db = getDb();
  const video = db.prepare(`INSERT INTO videos (id, youtube_video_id, title, movie_title, poc, language) VALUES (?, ?, ?, 'Película', 1, 'es')`);
  const clip = db.prepare(`INSERT INTO clips (id, video_id, start_time, end_time, status, wpm, avg_sentence_len) VALUES (?, ?, 0, 60, 'approved', ?, 4)`);
  const line = db.prepare(`INSERT INTO subtitle_lines (id, clip_id, line_index, text, start_time, end_time, translation_tr, structure)
    VALUES (?, ?, ?, ?, ?, ?, 'çeviri', '{"subject":[],"aux_verb":[0],"rest":[]}')`);
  const word = db.prepare(`INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time, starter_word_id) VALUES (?, ?, ?, ?, ?, ?)`);
  const starter = db.prepare(`INSERT OR IGNORE INTO vocab_words (id, word, translation_tr, cefr_level, language) VALUES (?, ?, '-', 'A1', 'es')`);
  const vocab = db.prepare(`INSERT INTO clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, 1)
    ON CONFLICT(clip_id, word_id) DO UPDATE SET occurrence_count = occurrence_count + 1`);
  let lineId = 0;
  SCENES.forEach(([id, wpm, lines], k) => {
    video.run(id, `yt-${id}`, id);
    clip.run(k + 1, id, wpm);
    lines.forEach((raw, i) => {
      lineId++;
      line.run(lineId, k + 1, i, raw.replace(/\*/g, ''), i * 5, i * 5 + 4);
      raw.split(' ').forEach((tok, j) => {
        const linked = tok.includes('*') || /^¿?quier/i.test(tok);
        const w = tok.replace(/\*/g, '');
        const sid = linked ? (/^¿?quier/i.test(tok) ? 'a2-es-querer' : STARTER(w)) : null;
        if (sid) {
          starter.run(sid, sid.slice(6));
          vocab.run(k + 1, sid, lineId);
        }
        word.run(lineId, j, w, i * 5 + j * 0.5, i * 5 + j * 0.5 + 0.5, sid);
      });
    });
  });
});

async function patternSets(q = '?lang=es') {
  const { GET } = await import('../app/api/v1/pattern-sets/route');
  const res: Response = await GET(new NextRequest(`http://localhost/api/v1/pattern-sets${q}`));
  assert.equal(res.status, 200);
  return res.json() as Promise<{ id: string; pattern_id: string; videos: { id: string; target_lines: number }[]; words: string[] }[]>;
}

test('one set per pattern of the path that has scenes, in path order', async () => {
  const sets = await patternSets();
  assert.deepEqual(sets.map(s => s.pattern_id), ['ser-estar-adj-yo', 'es-quiero', 'es-tengo']);
  assert.deepEqual(sets.map(s => s.id), ['pattern-ser-estar-adj-yo', 'pattern-es-quiero', 'pattern-es-tengo']);
});

test('a set holds the scenes of its pattern, most target lines first, then review, then slowest', async () => {
  const quiero = (await patternSets()).find(s => s.pattern_id === 'es-quiero')!;
  // es-a and es-c both have 2 lines of "Quiero"; es-a also repeats the
  // earlier "Yo estoy + sıfat", so it comes first.
  assert.deepEqual(quiero.videos.map(v => [v.id, v.target_lines]), [['es-a', 2], ['es-c', 2], ['es-e', 1], ['es-b', 1]]);
});

test('each pattern brings its own words, none twice', async () => {
  const sets = await patternSets();
  const words = Object.fromEntries(sets.map(s => [s.pattern_id, s.words]));
  // A word goes to the first pattern whose target lines use it, but a
  // pattern's own verb is its own: "querer" belongs to "Quiero" though
  // "Estoy listo, quiero ir." is a line of "Yo estoy + sıfat".
  assert.deepEqual(words['ser-estar-adj-yo'], ['a2-es-feliz']);
  assert.equal(words['es-quiero'][0], 'a2-es-querer');
  assert.deepEqual([...words['es-quiero']].sort(), ['a2-es-casa', 'a2-es-comer', 'a2-es-querer']);
  assert.deepEqual(words['es-tengo'], ['a2-es-idea']);
  const all = sets.flatMap(s => s.words);
  assert.equal(new Set(all).size, all.length);
});

test('videos keep the shape of /video-sets, so the app shows them as any set', async () => {
  const v = (await patternSets())[0].videos[0];
  for (const k of ['id', 'youtube_video_id', 'title', 'movie_title', 'clip_count', 'total_lines', 'tagged_lines', 'starter_words']) {
    assert.ok(k in v, `video has no ${k}`);
  }
});

test('English has no pattern sets', async () => {
  assert.deepEqual(await patternSets('?lang=en'), []);
  assert.deepEqual(await patternSets(''), []);
});

test('the path order is the app’s Spanish pattern path', async () => {
  const swift = fs.readFileSync(path.join(__dirname, '../../ios-native/EnglishLearning/Models/Pattern.swift'), 'utf8');
  const names = swift.match(/static let spanishAll: \[Pattern\] = \[([\s\S]*?)\]/)![1].match(/\w+/g)!;
  const idOf = (name: string) => swift.match(new RegExp(`static let ${name} = Pattern\\(\\s*id: "([^"]+)"`))![1];
  const { SPANISH_PATTERN_PATH } = await import('../lib/pattern-filters');
  assert.deepEqual(SPANISH_PATTERN_PATH, names.map(idOf));
});
