// The Spanish pattern path: which subtitle lines each verb pattern picks
// for its scene reel, and which patterns a clip's lines are marked with
// (the player shows a "Kalıp" chip on lines of patterns the learner has
// finished). Runs against a small fixture built here:
//
//   npx tsx --test tests/es-patterns.test.ts
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { LEGACY_SCHEMA } from './fixtures/legacy-schema';

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'es-patterns-test-')), 'fixture.db');
process.env.DATABASE_PATH = dbPath;
{
  const db = new Database(dbPath);
  db.exec(LEGACY_SCHEMA);
  db.close();
}

/** Each line, and the patterns it must be marked with (none: a near miss). */
const LINES: [string, string[]][] = [
  ['Quiero comer.', ['es-quiero']],
  ['¿Quieres jugar conmigo?', ['es-quiero']],
  ['Te quiero mucho.', []],                         // "seni seviyorum", not "istiyorum"
  ['Quiero que vengas.', []],
  ['Tengo una idea.', ['es-tengo']],
  ['¿Tienes hambre?', ['es-tengo']],
  ['Lo tengo.', []],
  ['Tengo que irme.', ['es-tengo-que']],
  ['Tienes que verlo.', ['es-tengo-que']],
  ['No puedo creerlo.', ['es-puedo']],
  ['¿Puedes ayudarme?', ['es-puedo']],
  ['Voy a ganar.', ['es-voy-a']],
  ['¡Vamos a ver!', ['es-voy-a']],
  ['Voy a la escuela.', []],                        // going somewhere, not "-eceğim"
  ['No sé.', ['es-se']],
  ['¿Sabes qué?', ['es-se']],
  ['No se puede.', []],                             // "se" without the accent is not saber
  ['Hay un problema.', ['es-hay']],
  ['No hay tiempo.', ['es-hay']],
  ['Hay que correr.', []],                          // "hay que" is "-mek lazım"
  ['Estoy feliz.', ['ser-estar-adj-yo']],
  ['Quiero estar listo.', ['es-quiero']],           // "estar listo" is not "estoy listo"
];

before(async () => {
  const { getDb } = await import('../lib/db');
  const db = getDb();
  db.exec(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, poc, language) VALUES ('es-vid', 'yt-es', 'Escena', 'Película', 1, 'es');
    INSERT INTO videos (id, youtube_video_id, title, movie_title, poc, language) VALUES ('en-vid', 'yt-en', 'Scene', 'Movie', 1, 'en');
    INSERT INTO clips (id, video_id, start_time, end_time, status) VALUES (1, 'es-vid', 0, 200, 'approved');
    INSERT INTO clips (id, video_id, start_time, end_time, status) VALUES (2, 'en-vid', 0, 30, 'approved');
  `);
  const line = db.prepare(`INSERT INTO subtitle_lines (id, clip_id, line_index, text, start_time, end_time, translation_tr, structure)
    VALUES (?, ?, ?, ?, ?, ?, 'çeviri', '{"subject":[],"aux_verb":[0],"rest":[]}')`);
  const word = db.prepare(`INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)`);
  LINES.forEach(([text], i) => {
    const id = i + 1;
    const start = i * 5;
    line.run(id, 1, i, text, start, start + 4);
    text.split(' ').forEach((w, j) => word.run(id, j, w, start + j * 0.5, start + j * 0.5 + 0.5));
  });
  line.run(100, 2, 0, 'I want to eat.', 1, 3);
  'I want to eat.'.split(' ').forEach((w, j) => word.run(100, j, w, 1 + j * 0.5, 1.5 + j * 0.5));
});

async function call(route: string, url: string, params: Record<string, string>) {
  const { GET } = await import(`../app/api/v1/${route}/route`);
  const res: Response = await GET(new NextRequest(`http://localhost${url}`), { params: Promise.resolve(params) });
  assert.equal(res.status, 200, `${url} → HTTP ${res.status}`);
  return res.json();
}

const SPANISH_PATTERNS = ['es-quiero', 'es-tengo', 'es-tengo-que', 'es-puedo', 'es-voy-a', 'es-se', 'es-hay'];

test('each Spanish verb pattern reels exactly its own lines', async () => {
  for (const id of SPANISH_PATTERNS) {
    const body = await call('patterns/[patternId]/scenes', `/api/v1/patterns/${id}/scenes`, { patternId: id });
    const got = body.items.map((i: { text: string }) => i.text).sort();
    const want = LINES.filter(([, ids]) => ids.includes(id)).map(([text]) => text).sort();
    assert.deepEqual(got, want, id);
  }
});

test('Spanish clip lines carry the patterns they contain', async () => {
  const clips = await call('poc-videos/[id]/clips', '/api/v1/poc-videos/es-vid/clips', { id: 'es-vid' });
  const got = clips[0].lines.map((l: { text: string; patternIds: string[] }) => [l.text, l.patternIds]);
  assert.deepEqual(got, LINES);
});

test('English clip lines keep their old shape', async () => {
  const clips = await call('poc-videos/[id]/clips', '/api/v1/poc-videos/en-vid/clips', { id: 'en-vid' });
  assert.equal('patternIds' in clips[0].lines[0], false);
});

test('every pattern the iOS app lists has a scene filter', async () => {
  const swift = fs.readFileSync(path.join(__dirname, '../../ios-native/EnglishLearning/Models/Pattern.swift'), 'utf8');
  const ids = [...swift.matchAll(/videoStructureId: "([^"]+)"/g)].map(m => m[1]);
  for (const id of SPANISH_PATTERNS) assert.ok(ids.includes(id), `iOS catalog has no ${id}`);
  const { PATTERN_FILTERS } = await import('../lib/pattern-filters');
  for (const id of ids) assert.ok(PATTERN_FILTERS[id], `no backend filter for ${id}`);
});
