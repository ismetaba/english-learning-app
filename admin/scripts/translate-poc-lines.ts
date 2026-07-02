/**
 * Backfill `subtitle_lines.translation_tr` for POC lines that don't have a
 * Turkish translation yet. Uses local Ollama for batch translation. Writes
 * by exact text match so the same English line in different videos shares
 * a translation (mirrors translate-local.ts but scoped to POC).
 *
 * Idempotent: only picks rows where translation_tr IS NULL or empty.
 *
 * Run: cd admin && npx tsx scripts/translate-poc-lines.ts [--limit N] [--model NAME]
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) : 0;
const modelIdx = args.indexOf('--model');
const MODEL = modelIdx >= 0 ? args[modelIdx + 1] : 'gemma3:4b';
const BATCH_SIZE = 30;
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

const db = new Database(path.join(__dirname, '..', '..', 'data.db'));
db.pragma('journal_mode = WAL');

const rows = db
  .prepare(
    `SELECT DISTINCT sl.text
     FROM subtitle_lines sl
     JOIN clips c ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND (sl.translation_tr IS NULL OR length(trim(sl.translation_tr)) = 0)
       AND sl.text IS NOT NULL
       AND length(trim(sl.text)) > 0
     ORDER BY sl.text
     ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}`,
  )
  .all() as { text: string }[];

console.log(`Translate POC lines (model=${MODEL})`);
console.log('-----');
console.log(`${rows.length.toLocaleString()} unique untranslated POC texts`);
if (rows.length === 0) {
  db.close();
  process.exit(0);
}

const updateStmt = db.prepare(
  `UPDATE subtitle_lines SET translation_tr = ?
   WHERE text = ?
     AND (translation_tr IS NULL OR length(trim(translation_tr)) = 0)`,
);

async function translateBatch(texts: string[]): Promise<Record<string, string>> {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `Translate these English movie dialogue lines to Turkish. Natural, conversational Turkish.

Rules:
- Keep names as-is (Annie, Michael, etc.)
- Possessives: "Annie's bag" -> "Annie'nin çantası"
- Return ONLY numbered translations, nothing else
- Same numbering as input

${numbered}`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 4096 },
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
      if (idx >= 0 && idx < texts.length && match[2].trim().length > 0) {
        translations[texts[idx]] = match[2].trim();
      }
    }
  }
  return translations;
}

async function main() {
  let translated = 0;
  let failed = 0;
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  const start = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(r => r.text);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const translations = await translateBatch(batch);
      const tx = db.transaction(() => {
        for (const [text, tr] of Object.entries(translations)) {
          translated += updateStmt.run(tr, text).changes;
        }
      });
      tx();
      const got = Object.keys(translations).length;
      failed += batch.length - got;
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`[${batchNum}/${totalBatches} | ${elapsed}s] +${got}/${batch.length} (rows updated: ${translated})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${batchNum}/${totalBatches}] ERROR: ${msg}`);
      failed += batch.length;
    }
  }

  console.log(`\nDone. Updated ${translated} subtitle_lines rows. Failed: ${failed}.`);

  const remaining = db
    .prepare(
      `SELECT COUNT(DISTINCT sl.text) AS n
       FROM subtitle_lines sl
       JOIN clips c ON c.id = sl.clip_id
       JOIN videos v ON v.id = c.video_id
       WHERE v.poc = 1
         AND c.status = 'approved'
         AND (sl.translation_tr IS NULL OR length(trim(sl.translation_tr)) = 0)
         AND sl.text IS NOT NULL
         AND length(trim(sl.text)) > 0`,
    )
    .get() as { n: number };
  console.log(`Remaining untranslated unique POC texts: ${remaining.n}`);

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
