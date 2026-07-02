/**
 * Feynman video-first POC migration.
 *
 * Adds the columns and indexes needed to:
 *   - flag a 100-video POC subset (videos.poc)
 *   - score clip difficulty for sorting (clips.wpm / a2_ratio / avg_sentence_len)
 *   - store sentence-structure tags per subtitle line (subtitle_lines.structure)
 *
 * Idempotent — safe to re-run. Each ALTER is guarded against an existing column
 * via PRAGMA table_info, and the index uses CREATE INDEX IF NOT EXISTS.
 *
 * Run: cd admin && npx tsx scripts/migrate-feynman-poc.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some(r => r.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (hasColumn(table, column)) {
    console.log(`  · ${table}.${column} already exists, skipping`);
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`  + ${table}.${column} ${definition}`);
}

console.log(`Feynman POC migration → ${DB_PATH}`);
console.log('-------------------------------------');

db.exec('BEGIN');
try {
  addColumnIfMissing('videos', 'poc', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('clips', 'wpm', 'REAL');
  addColumnIfMissing('clips', 'a2_ratio', 'REAL');
  addColumnIfMissing('clips', 'avg_sentence_len', 'REAL');
  addColumnIfMissing('subtitle_lines', 'structure', 'TEXT'); // JSON-as-text
  // Per-word starter mapping — lets the clip-player pause when an active
  // starter word is on screen without re-matching inflections at runtime.
  addColumnIfMissing('word_timestamps', 'starter_word_id', 'TEXT REFERENCES vocab_words(id) ON DELETE SET NULL');

  db.exec(`CREATE INDEX IF NOT EXISTS idx_videos_poc ON videos(poc) WHERE poc = 1`);
  console.log(`  + index idx_videos_poc (partial on poc = 1)`);

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Migration failed, rolled back.', err);
  process.exit(1);
}

const cols = (table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(r => r.name);
console.log('\nFinal columns:');
console.log(`  videos:         [${cols('videos').join(', ')}]`);
console.log(`  clips:          [${cols('clips').join(', ')}]`);
console.log(`  subtitle_lines: [${cols('subtitle_lines').join(', ')}]`);

db.close();
console.log('\nDone.');
