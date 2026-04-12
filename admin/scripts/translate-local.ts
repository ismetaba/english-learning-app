/**
 * Translate targeted subtitle lines to Turkish using local Ollama.
 * Free, no API limits, runs entirely on your machine.
 *
 * Run: cd admin && npx tsx scripts/translate-local.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');

const MODEL = 'gemma3:4b';
const BATCH_SIZE = 30;
const OLLAMA_URL = 'http://localhost:11434/api/generate';

// Get unique untranslated texts
const untranslated = db.prepare(`
  SELECT DISTINCT sl.text
  FROM targeted_lines tl
  JOIN subtitle_lines sl ON sl.id = tl.line_id
  WHERE sl.translation_tr IS NULL
  ORDER BY LENGTH(sl.text)
`).all() as { text: string }[];

console.log(`${untranslated.length} unique texts to translate using ${MODEL}`);

const updateStmt = db.prepare(
  `UPDATE subtitle_lines SET translation_tr = ? WHERE text = ? AND translation_tr IS NULL`
);

async function translateBatch(texts: string[]): Promise<Record<string, string>> {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `Translate these English movie dialogue lines to Turkish. Natural, conversational Turkish.

Rules:
- Keep names as-is (Annie, Michael, etc.)
- Possessives: "Annie's bag" → "Annie'nin çantası"
- Return ONLY numbered translations, nothing else
- Same numbering as input

${numbered}`;

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 4096 },
    }),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

  const data = await response.json();
  const content = data.response || '';
  const translations: Record<string, string> = {};

  const lines = content.split('\n').filter((l: string) => l.trim());
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < texts.length && match[2].trim().length > 0) {
        translations[texts[idx]] = match[2].trim();
      }
    }
  }

  return translations;
}

async function main() {
  // Check Ollama is running
  try {
    await fetch('http://localhost:11434/api/tags');
  } catch {
    console.error('ERROR: Ollama is not running. Start it with: ollama serve');
    process.exit(1);
  }

  let translated = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
    const batch = untranslated.slice(i, i + BATCH_SIZE).map(r => r.text);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(untranslated.length / BATCH_SIZE);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const rate = translated / Math.max(elapsed, 1);
    const remaining = rate > 0 ? Math.floor((untranslated.length - i) / rate) : 0;

    try {
      const translations = await translateBatch(batch);

      for (const [text, tr] of Object.entries(translations)) {
        const result = updateStmt.run(tr, text);
        translated += result.changes;
      }

      failed += batch.length - Object.keys(translations).length;
      console.log(`[${batchNum}/${totalBatches}] ✓ ${Object.keys(translations).length}/${batch.length} (total: ${translated}, ${Math.floor(elapsed / 60)}m elapsed, ~${Math.floor(remaining / 60)}m left)`);
    } catch (err: any) {
      console.log(`[${batchNum}/${totalBatches}] ✗ ${err.message}`);
      failed += batch.length;
    }
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\nDone in ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`Translated: ${translated}, Failed: ${failed}`);

  const remaining = (db.prepare(`
    SELECT COUNT(DISTINCT sl.text) FROM targeted_lines tl
    JOIN subtitle_lines sl ON sl.id = tl.line_id WHERE sl.translation_tr IS NULL
  `).get() as any)['COUNT(DISTINCT sl.text)'];
  console.log(`Remaining untranslated: ${remaining}`);

  db.close();
}

main().catch(console.error);
