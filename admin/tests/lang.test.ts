// Language dimension of the v1 API: English (the original corpus) and
// Spanish (the new track) share one database, and every route must keep
// them apart. Runs against a small fixture built here, so it needs no real
// data.db:
//
//   npx tsx --test tests/lang.test.ts
//
// The fixture starts with the PRE-language production schema (no
// `language` columns), so the first getDb() exercises the same migration
// production runs on its first request after deploy.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lang-test-')), 'fixture.db');
process.env.DATABASE_PATH = dbPath;

// Production shape before the language dimension, English content only.
{
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE videos (id TEXT PRIMARY KEY, youtube_video_id TEXT NOT NULL, title TEXT NOT NULL,
      movie_title TEXT NOT NULL, genre TEXT, difficulty TEXT DEFAULT 'intermediate',
      duration_seconds INTEGER, poc INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE clips (id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
      start_time REAL, end_time REAL, status TEXT DEFAULT 'draft', wpm REAL, a2_ratio REAL,
      avg_sentence_len REAL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE subtitle_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, clip_id INTEGER REFERENCES clips(id) ON DELETE CASCADE,
      line_index INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL,
      translation_tr TEXT, structure TEXT);
    CREATE TABLE word_timestamps (id INTEGER PRIMARY KEY AUTOINCREMENT, line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE CASCADE,
      word_index INTEGER, word TEXT, start_time REAL, end_time REAL, starter_word_id TEXT);
    CREATE TABLE vocab_words (id TEXT PRIMARY KEY, word TEXT, ipa TEXT, part_of_speech TEXT,
      translation_tr TEXT, example_sentence TEXT, example_translation_tr TEXT,
      frequency_rank INTEGER, cefr_level TEXT);
    CREATE TABLE word_translations (word_lower TEXT PRIMARY KEY, translation_tr TEXT);
    CREATE TABLE video_sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, title_tr TEXT, description TEXT,
      description_tr TEXT, difficulty TEXT, sort_order INTEGER);
    CREATE TABLE video_set_items (set_id TEXT, video_id TEXT, sort_order INTEGER, PRIMARY KEY(set_id, video_id));
    CREATE TABLE clip_vocab (clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
      line_id INTEGER REFERENCES subtitle_lines(id) ON DELETE SET NULL,
      occurrence_count INTEGER DEFAULT 1, PRIMARY KEY (clip_id, word_id));
  `);
  db.exec(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, poc) VALUES ('en-vid', 'yt-en', 'English Clip', 'Movie', 1);
    INSERT INTO clips (id, video_id, start_time, end_time, status) VALUES (1, 'en-vid', 0, 30, 'approved');
    INSERT INTO subtitle_lines (id, clip_id, line_index, text, start_time, end_time, translation_tr, structure) VALUES
      (1, 1, 0, 'I am happy.', 1, 2.5, 'Mutluyum.', '{"subject":[0],"aux_verb":[1],"rest":[2]}'),
      (2, 1, 1, 'No, son.', 3, 4, 'Hayır, oğlum.', '{"subject":[],"aux_verb":[],"rest":[0,1]}');
    INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time, starter_word_id) VALUES
      (1, 0, 'I', 1, 1.3, NULL), (1, 1, 'am', 1.3, 1.6, NULL), (1, 2, 'happy.', 1.6, 2.5, 'a2-happy'),
      (2, 0, 'No,', 3, 3.4, NULL), (2, 1, 'son.', 3.4, 4, NULL);
    INSERT INTO vocab_words (id, word, translation_tr, cefr_level) VALUES ('a2-happy', 'happy', 'mutlu', 'A1');
    INSERT INTO clip_vocab (clip_id, word_id, line_id) VALUES (1, 'a2-happy', 1);
    INSERT INTO word_translations VALUES ('no', 'hayır'), ('son', 'oğul'), ('happy', 'mutlu');
    INSERT INTO video_sets (id, title, sort_order) VALUES ('set-en', 'English Set', 1);
    INSERT INTO video_set_items VALUES ('set-en', 'en-vid', 1);
  `);
  db.close();
}

// Spanish content can only be written once the migration has added the
// language columns, i.e. after the routes' first getDb().
before(async () => {
  const { getDb } = await import('../lib/db');
  getDb().exec(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, poc, language) VALUES ('es-vid', 'yt-es', 'Spanish Clip', 'Peppa', 1, 'es');
    INSERT INTO clips (id, video_id, start_time, end_time, status) VALUES (2, 'es-vid', 0, 30, 'approved');
    INSERT INTO subtitle_lines (id, clip_id, line_index, text, start_time, end_time, translation_tr, structure) VALUES
      (10, 2, 0, '¿Está cansado?', 1, 2, 'Yorgun mu?', '{"subject":[],"aux_verb":[0],"rest":[1]}'),
      (11, 2, 1, 'Estoy feliz.', 3, 4, 'Mutluyum.', '{"subject":[],"aux_verb":[0],"rest":[1]}'),
      (12, 2, 2, 'No, son buenos.', 5, 6.5, 'Hayır, onlar iyi.', '{"subject":[],"aux_verb":[1],"rest":[0,2]}');
    INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time, starter_word_id) VALUES
      (10, 0, '¿Está', 1, 1.5, NULL), (10, 1, 'cansado?', 1.5, 2, NULL),
      (11, 0, 'Estoy', 3, 3.4, NULL), (11, 1, 'feliz.', 3.4, 4, 'a2-es-feliz'),
      (12, 0, 'No,', 5, 5.4, NULL), (12, 1, 'son', 5.4, 5.8, NULL), (12, 2, 'buenos.', 5.8, 6.5, NULL);
    INSERT INTO vocab_words (id, word, translation_tr, cefr_level, language) VALUES ('a2-es-feliz', 'feliz', 'mutlu', 'A1', 'es');
    INSERT INTO clip_vocab (clip_id, word_id, line_id) VALUES (2, 'a2-es-feliz', 11);
    INSERT INTO word_translations_es VALUES ('no', 'hayır'), ('son', 'onlar -dır'), ('está', 'o -dır'),
      ('cansado', 'yorgun'), ('estoy', 'ben -ım'), ('feliz', 'mutlu'), ('buenos', 'iyi');
    INSERT INTO video_sets (id, title, title_tr, sort_order) VALUES ('es-set-1', 'Spanish Starter', 'İspanyolca Başlangıç', 2);
    INSERT INTO video_set_items VALUES ('es-set-1', 'es-vid', 1);
  `);
});

async function call(route: string, url: string, params: Record<string, string> = {}) {
  const { GET } = await import(`../app/api/v1/${route}/route`);
  const res: Response = await GET(new NextRequest(`http://localhost${url}`), { params: Promise.resolve(params) });
  assert.equal(res.status, 200, `${url} → HTTP ${res.status}`);
  return res.json();
}

type Word = { word: string; translationTr: string | null };
const glosses = (words: Word[]) => words.map(w => [w.word, w.translationTr]);

test('migration adds language, existing rows default to en', async () => {
  const { getDb } = await import('../lib/db');
  const db = getDb();
  for (const table of ['videos', 'vocab_words']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    assert.ok(cols.some(c => c.name === 'language'), `${table}.language missing`);
  }
  const row = db.prepare(`SELECT language FROM videos WHERE id = 'en-vid'`).get() as { language: string };
  assert.equal(row.language, 'en');
});

test('video-sets and poc-videos serve one language at a time', async () => {
  const sets = (lang: string) => call('video-sets', `/api/v1/video-sets${lang}`);
  assert.deepEqual((await sets('')).map((s: { id: string }) => s.id), ['set-en']);
  assert.deepEqual((await sets('?lang=en')).map((s: { id: string }) => s.id), ['set-en']);
  const es = await sets('?lang=es');
  assert.deepEqual(es.map((s: { id: string }) => s.id), ['es-set-1']);
  assert.deepEqual(es[0].videos.map((v: { id: string }) => v.id), ['es-vid']);

  const ids = async (q: string) =>
    (await call('poc-videos', `/api/v1/poc-videos${q}`)).map((v: { id: string }) => v.id);
  assert.deepEqual(await ids(''), ['en-vid']);
  assert.deepEqual(await ids('?lang=xx'), ['en-vid']);
  assert.deepEqual(await ids('?lang=es'), ['es-vid']);
});

test('clips gloss words from the video’s own language', async () => {
  const en = await call('poc-videos/[id]/clips', '/api/v1/poc-videos/en-vid/clips', { id: 'en-vid' });
  assert.deepEqual(glosses(en[0].lines[1].words), [['No,', 'hayır'], ['son.', 'oğul']]);

  const es = await call('poc-videos/[id]/clips', '/api/v1/poc-videos/es-vid/clips', { id: 'es-vid' });
  const [q, , neg] = es[0].lines;
  assert.deepEqual(glosses(q.words), [['¿Está', 'o -dır'], ['cansado?', 'yorgun']]);
  assert.deepEqual(glosses(neg.words), [['No,', 'hayır'], ['son', 'onlar -dır'], ['buenos.', 'iyi']]);
});

test('vocab-feed keeps each language’s starters apart', async () => {
  const wordIds = async (q: string) =>
    new Set((await call('vocab-feed', `/api/v1/vocab-feed${q}`)).items.map((i: { wordId: string }) => i.wordId));
  assert.deepEqual(await wordIds('?ids=a2-happy&discovery=1'), new Set(['a2-happy']));
  assert.deepEqual(await wordIds('?ids=a2-es-feliz&discovery=1&lang=es'), new Set(['a2-es-feliz']));

  const es = await call('vocab-feed', '/api/v1/vocab-feed?ids=a2-es-feliz&lang=es');
  assert.deepEqual(glosses(es.items[0].context.words), [['Estoy', 'ben -ım'], ['feliz.', 'mutlu']]);
  assert.deepEqual(es.items[0].context.phrases, []);
});

test('pattern scenes take their language from the pattern', async () => {
  const texts = async (id: string, q = '') =>
    (await call('patterns/[patternId]/scenes', `/api/v1/patterns/${id}/scenes${q}`, { patternId: id }))
      .items.map((i: { text: string }) => i.text);
  // "¿Está" needs ¿ stripped; "Estoy feliz." is two words (pro-drop).
  assert.deepEqual(await texts('ser-estar-adj-el'), ['¿Está cansado?']);
  assert.deepEqual(await texts('ser-estar-adj-yo'), ['Estoy feliz.']);
  assert.deepEqual(await texts('ser-estar-adj-ellos'), ['No, son buenos.']);
  assert.deepEqual(await texts('be-adj-i'), ['I am happy.']);
  // A stray ?lang= can't pull English lines into a Spanish pattern or vice versa.
  assert.deepEqual(await texts('be-adj-i', '?lang=es'), ['I am happy.']);
});

test('Spanish requests never read the English gloss table', async () => {
  // The Spanish content database is built without word_translations; a
  // Spanish request must not depend on it.
  const { getDb } = await import('../lib/db');
  const db = getDb();
  db.exec('ALTER TABLE word_translations RENAME TO word_translations_off');
  try {
    await call('poc-videos/[id]/clips', '/api/v1/poc-videos/es-vid/clips', { id: 'es-vid' });
    await call('vocab-feed', '/api/v1/vocab-feed?ids=a2-es-feliz&lang=es');
    await call('patterns/[patternId]/scenes', '/api/v1/patterns/ser-estar-adj-yo/scenes', { patternId: 'ser-estar-adj-yo' });
    await call('starter-words/[id]/contexts', '/api/v1/starter-words/a2-es-feliz/contexts', { id: 'a2-es-feliz' });
  } finally {
    db.exec('ALTER TABLE word_translations_off RENAME TO word_translations');
  }
});

test('starter contexts gloss words from the starter’s language', async () => {
  const es = await call('starter-words/[id]/contexts', '/api/v1/starter-words/a2-es-feliz/contexts', { id: 'a2-es-feliz' });
  assert.equal(es.contextCount, 1);
  assert.deepEqual(glosses(es.contexts[0].words), [['Estoy', 'ben -ım'], ['feliz.', 'mutlu']]);

  const en = await call('starter-words/[id]/contexts', '/api/v1/starter-words/a2-happy/contexts', { id: 'a2-happy' });
  assert.deepEqual(glosses(en.contexts[0].words), [['I', null], ['am', null], ['happy.', 'mutlu']]);
});
