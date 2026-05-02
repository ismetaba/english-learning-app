/**
 * Populate word_translations for every unique word in POC video
 * word_timestamps. Local Ollama variant of populate-word-translations.ts —
 * skips words that already have a translation and only writes the new ones.
 *
 * Run: cd admin && npx tsx scripts/populate-word-translations-local.ts [--model NAME]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const modelIdx = args.indexOf('--model');
const MODEL = modelIdx >= 0 ? args[modelIdx + 1] : 'gemma3:4b';
const BATCH_SIZE = 60;
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');

function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
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
  const n = normalize(r.word);
  if (n.length > 0) uniqueWords.add(n);
}

const existing = db
  .prepare(`SELECT word_lower FROM word_translations`)
  .all() as { word_lower: string }[];
const existingSet = new Set(existing.map(r => r.word_lower));

const todo = [...uniqueWords].filter(w => !existingSet.has(w)).sort();

console.log(`Populate word_translations (model=${MODEL})`);
console.log('-----');
console.log(`POC unique words: ${uniqueWords.size}`);
console.log(`Already translated: ${existingSet.size}`);
console.log(`To translate: ${todo.length}`);

if (todo.length === 0) {
  db.close();
  process.exit(0);
}

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO word_translations (word_lower, translation_tr) VALUES (?, ?)`,
);

async function translateBatch(words: string[]): Promise<Record<string, string>> {
  const numbered = words.map((w, i) => `${i + 1}. ${w}`).join('\n');

  const prompt = `Translate single English words to Turkish for an A2 language-learning app that shows a per-word gloss under English subtitles.

Rules:
- Output the most common, neutral Turkish meaning for each word out of context.
- Single best Turkish word or short phrase. No alternatives, no parentheses, no explanation.
- For function words with no direct Turkish equivalent (a, an, the): output a short hyphen "-".
- Contractions: translate the spoken meaning ("i'm" -> "ben", "don't" -> "değil", "you're" -> "sen", "gonna" -> "-ecek", "wanna" -> "istemek", "let's" -> "haydi").
- Names / proper nouns (alpha, junior): keep as-is or transliterate naturally if there's a common Turkish form.
- Keep the same numbering. Return ONLY the lines, in the form:
  1. <translation>
  2. <translation>

${numbered}`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { response?: string };
  const content = data.response ?? '';
  const translations: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < words.length && match[2].trim().length > 0) {
        translations[words[idx]] = match[2].trim();
      }
    }
  }
  return translations;
}

async function main() {
  let translated = 0;
  let failed = 0;
  const totalBatches = Math.ceil(todo.length / BATCH_SIZE);
  const start = Date.now();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const translations = await translateBatch(batch);
      const tx = db.transaction(() => {
        for (const [word, tr] of Object.entries(translations)) {
          insertStmt.run(word, tr);
          translated++;
        }
      });
      tx();
      const got = Object.keys(translations).length;
      failed += batch.length - got;
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`[${batchNum}/${totalBatches} | ${elapsed}s] +${got}/${batch.length} (cum: ${translated})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${batchNum}/${totalBatches}] ERROR: ${msg}`);
      failed += batch.length;
    }
  }

  console.log(`\nDone. Translated ${translated}, failed ${failed}.`);

  const sample = db
    .prepare(`SELECT word_lower, translation_tr FROM word_translations ORDER BY RANDOM() LIMIT 8`)
    .all() as { word_lower: string; translation_tr: string }[];
  console.log('\nSample:');
  for (const s of sample) console.log(`  ${s.word_lower.padEnd(15)} -> ${s.translation_tr}`);

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
