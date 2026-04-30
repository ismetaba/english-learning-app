/**
 * Populate word_translations for every unique word that appears in
 * word_timestamps for POC videos. The clip player renders these as a
 * small italic gloss under each English word, so the learner sees
 * Turkish word-by-word instead of (or alongside) full sentence
 * translations.
 *
 * One row per lowercase + punctuation-stripped surface form. Same word
 * across multiple videos shares a single translation — this is "best
 * effort base form Turkish", not a context-aware gloss. Re-runs are
 * idempotent: existing rows are skipped.
 *
 * Run: cd admin && npx tsx scripts/populate-word-translations.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');

const client = new Anthropic();

/** Lowercase + strip leading/trailing punctuation. Keeps internal
 *  apostrophes ("don't" stays as "don't"). */
function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, '');
}

const rows = db
  .prepare(
    `SELECT DISTINCT wt.word
     FROM word_timestamps wt
     JOIN subtitle_lines sl ON sl.id = wt.line_id
     JOIN clips c ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1`,
  )
  .all() as { word: string }[];

const uniqueWords = new Set<string>();
for (const r of rows) {
  const normalized = normalize(r.word);
  if (normalized.length > 0) uniqueWords.add(normalized);
}

const existing = db
  .prepare(`SELECT word_lower FROM word_translations`)
  .all() as { word_lower: string }[];
const existingSet = new Set(existing.map(r => r.word_lower));

const todo = [...uniqueWords].filter(w => !existingSet.has(w)).sort();

console.log(`POC unique words: ${uniqueWords.size}`);
console.log(`Already translated: ${existingSet.size}`);
console.log(`To translate: ${todo.length}`);

if (todo.length === 0) {
  console.log('Nothing to do.');
  db.close();
  process.exit(0);
}

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO word_translations (word_lower, translation_tr) VALUES (?, ?)`,
);

const BATCH_SIZE = 60;

async function translateBatch(words: string[]): Promise<Record<string, string>> {
  const numbered = words.map((w, i) => `${i + 1}. ${w}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You will translate single English words to Turkish for an A2 language-learning app that shows a per-word gloss under English subtitles.

Rules:
- Output the most common, neutral Turkish meaning for each word out of context.
- Single best Turkish word or short phrase. No alternatives, no parentheses, no explanation.
- For function words with no direct Turkish equivalent (a, an, the): output a short hyphen "-".
- Contractions: translate the spoken meaning ("i'm" → "ben", "don't" → "değil", "you're" → "sen", "gonna" → "-ecek", "wanna" → "istemek", "let's" → "haydi").
- Names / proper nouns (alpha, junior): keep as-is or transliterate naturally if there's a common Turkish form.
- Keep the same numbering. Return ONLY the lines, in the form:
  1. <translation>
  2. <translation>
  ...

${numbered}`,
      },
    ],
  });

  const content = (response.content[0] as { text: string }).text;
  const translations: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < words.length) {
        translations[words[idx]] = match[2].trim();
      }
    }
  }

  return translations;
}

async function main() {
  let translated = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(todo.length / BATCH_SIZE);

    try {
      const translations = await translateBatch(batch);

      for (const [word, tr] of Object.entries(translations)) {
        insertStmt.run(word, tr);
        translated += 1;
      }

      const done = Object.keys(translations).length;
      failed += batch.length - done;
      console.log(
        `[${batchNum}/${totalBatches}] Translated ${done}/${batch.length} (cumulative: ${translated})`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${batchNum}/${totalBatches}] ERROR: ${msg}`);
      failed += batch.length;
    }
  }

  console.log(`\nDone! Translated: ${translated}, Failed: ${failed}`);

  // Sample
  const sample = db
    .prepare(`SELECT word_lower, translation_tr FROM word_translations ORDER BY RANDOM() LIMIT 10`)
    .all() as { word_lower: string; translation_tr: string }[];
  console.log('\nSample:');
  for (const s of sample) console.log(`  ${s.word_lower.padEnd(15)} → ${s.translation_tr}`);

  db.close();
}

main().catch(console.error);
