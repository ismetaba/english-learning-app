/**
 * Translate targeted subtitle lines to Turkish.
 * Uses Claude API via the Anthropic SDK for batch translation.
 *
 * Run: cd admin && npx tsx scripts/translate-targeted.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');

const client = new Anthropic();

// Get unique untranslated texts from targeted lines
const untranslated = db.prepare(`
  SELECT DISTINCT sl.text
  FROM targeted_lines tl
  JOIN subtitle_lines sl ON sl.id = tl.line_id
  WHERE sl.translation_tr IS NULL
  ORDER BY sl.text
`).all() as { text: string }[];

console.log(`${untranslated.length} unique texts to translate`);

const updateStmt = db.prepare(`
  UPDATE subtitle_lines SET translation_tr = ? WHERE text = ? AND translation_tr IS NULL
`);

const BATCH_SIZE = 50;

async function translateBatch(texts: string[]): Promise<Record<string, string>> {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Translate these English movie dialogue lines to Turkish. Keep it natural and conversational.

IMPORTANT:
- Translate names/proper nouns as-is (don't translate "Annie", "Michael", etc.)
- For possessives like "Annie's bag", translate as "Annie'nin çantası"
- Keep the same numbering
- Return ONLY the translations, one per line, with the same numbers

${numbered}`
    }]
  });

  const content = (response.content[0] as any).text as string;
  const translations: Record<string, string> = {};

  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < texts.length) {
        translations[texts[idx]] = match[2].trim();
      }
    }
  }

  return translations;
}

async function main() {
  let translated = 0;
  let failed = 0;

  for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
    const batch = untranslated.slice(i, i + BATCH_SIZE).map(r => r.text);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(untranslated.length / BATCH_SIZE);

    try {
      const translations = await translateBatch(batch);

      for (const [text, tr] of Object.entries(translations)) {
        const result = updateStmt.run(tr, text);
        translated += result.changes;
      }

      failed += batch.length - Object.keys(translations).length;
      console.log(`[${batchNum}/${totalBatches}] Translated ${Object.keys(translations).length}/${batch.length} (total: ${translated})`);
    } catch (err: any) {
      console.log(`[${batchNum}/${totalBatches}] ERROR: ${err.message}`);
      failed += batch.length;
    }
  }

  console.log(`\nDone! Translated: ${translated}, Failed: ${failed}`);

  // Verify
  const remaining = (db.prepare(`
    SELECT COUNT(DISTINCT sl.text) FROM targeted_lines tl
    JOIN subtitle_lines sl ON sl.id = tl.line_id
    WHERE sl.translation_tr IS NULL
  `).get() as any)[`COUNT(DISTINCT sl.text)`];
  console.log(`Remaining untranslated: ${remaining}`);

  db.close();
}

main().catch(console.error);
