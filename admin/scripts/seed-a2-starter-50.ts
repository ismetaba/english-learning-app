/**
 * Seed the A2 starter-50 word set into vocab_words.
 *
 * Reads assets/wordlists/a2-starter-50.json (single source of truth for the
 * starter set) and upserts each entry into vocab_words. The mobile app and
 * the admin populate-clip-vocab script both consume vocab_words downstream.
 *
 * Idempotent: re-running just refreshes translation/pos. ipa/example fields
 * are left null for now — populate them in a separate pass when needed.
 *
 * Run: cd admin && npx tsx scripts/seed-a2-starter-50.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

type StarterWord = { id: string; word: string; pos: 'verb' | 'adj' | 'noun'; tr: string };

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const WORDLIST_PATH = path.join(
  __dirname,
  '..',
  '..',
  'assets',
  'wordlists',
  'a2-starter-100.json',
);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`Seeding A2 starter-50 from ${WORDLIST_PATH}`);

const json = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8')) as { words: StarterWord[] };
const words = json.words;

if (words.length === 0) {
  console.error('Wordlist is empty. Aborting.');
  process.exit(1);
}
console.log(`Found ${words.length} words in wordlist`);

// Validate
for (const w of words) {
  if (!w.id || !w.word || !w.pos || !w.tr) {
    console.error(`Invalid entry: ${JSON.stringify(w)}`);
    process.exit(1);
  }
  if (!['verb', 'adj', 'noun'].includes(w.pos)) {
    console.error(`Bad pos for ${w.id}: ${w.pos}`);
    process.exit(1);
  }
}

const upsert = db.prepare(`
  INSERT INTO vocab_words (id, word, part_of_speech, translation_tr, cefr_level)
  VALUES (?, ?, ?, ?, 'a2')
  ON CONFLICT(id) DO UPDATE SET
    word = excluded.word,
    part_of_speech = excluded.part_of_speech,
    translation_tr = excluded.translation_tr,
    cefr_level = 'a2'
`);

const tx = db.transaction((rows: StarterWord[]) => {
  for (const w of rows) {
    upsert.run(w.id, w.word.toLowerCase(), w.pos, w.tr);
  }
});

tx(words);

const verifyCount = (db.prepare(`SELECT COUNT(*) AS c FROM vocab_words WHERE cefr_level = 'a2'`).get() as any).c;
console.log(`Upserted ${words.length}; vocab_words now has ${verifyCount} A2 entries.`);

const samples = db.prepare(`
  SELECT id, word, part_of_speech AS pos, translation_tr
  FROM vocab_words
  WHERE id LIKE 'a2-%'
  ORDER BY id
  LIMIT 5
`).all();
console.log('\nSample (first 5):');
console.table(samples);

db.close();
console.log('\nDone.');
