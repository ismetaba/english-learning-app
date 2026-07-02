/**
 * Tag every POC subtitle line with its sentence structure (subject /
 * aux+verb / rest) using Claude Haiku 4.5 with structured outputs.
 *
 * Token alignment: we send the line's exact word_timestamps tokens with
 * their indices and ask the model to bucket those indices. The model can't
 * hallucinate token positions, so the result lines up with the runtime
 * renderer that walks the same word_timestamps rows.
 *
 * Modes:
 *   --sample N   tag only the first N un-tagged lines, print each result
 *                so a human can review before bulk run
 *   default      tag every POC line where structure IS NULL (resumable —
 *                re-running just picks up where it left off)
 *
 * Cost: ~$1/1M input + $5/1M output on Haiku 4.5. Roughly $0.50–$1 per
 * 1K lines tagged with 20-line batches and structured outputs.
 *
 * Run: cd admin && npx tsx scripts/tag-sentence-structure.ts [--sample 20]
 */
import Database from 'better-sqlite3';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5';
const BATCH_SIZE = 20;
const MAX_TOKENS = 8000;
const MAX_RETRIES = 3;
const PROGRESS_EVERY_N_BATCHES = 25;

const args = process.argv.slice(2);
const sampleIdx = args.indexOf('--sample');
const sampleMode = sampleIdx >= 0;
const sampleSize = sampleMode ? parseInt(args[sampleIdx + 1] ?? '20', 10) : 0;

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const client = new Anthropic();

console.log(`Tag sentence structure ${sampleMode ? `(SAMPLE: ${sampleSize} lines)` : '(FULL POC)'}`);
console.log(`Model: ${MODEL}`);
console.log('---');

// ─── Pull POC lines that still need tagging ────────────────────────────────
const lines = db
  .prepare(
    `SELECT sl.id, sl.text
     FROM subtitle_lines sl
     JOIN clips c  ON c.id = sl.clip_id
     JOIN videos v ON v.id = c.video_id
     WHERE v.poc = 1
       AND c.status = 'approved'
       AND sl.structure IS NULL
       AND sl.text IS NOT NULL
       AND length(trim(sl.text)) > 0
     ORDER BY sl.id
     ${sampleMode ? `LIMIT ${sampleSize}` : ''}`,
  )
  .all() as { id: number; text: string }[];

console.log(`${lines.length.toLocaleString()} POC lines need tagging`);
if (lines.length === 0) {
  db.close();
  console.log('Nothing to do.');
  process.exit(0);
}

// ─── Pre-load word_timestamps for those lines ──────────────────────────────
// Chunk to dodge SQLite's 999-host-parameter limit.
const PARAM_CHUNK = 800;
const tokensByLine = new Map<number, [number, string][]>();
for (let i = 0; i < lines.length; i += PARAM_CHUNK) {
  const slice = lines.slice(i, i + PARAM_CHUNK).map(l => l.id);
  const placeholders = slice.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT line_id, word_index, word
       FROM word_timestamps
       WHERE line_id IN (${placeholders})
       ORDER BY line_id, word_index`,
    )
    .all(...slice) as { line_id: number; word_index: number; word: string }[];
  for (const r of rows) {
    let arr = tokensByLine.get(r.line_id);
    if (!arr) {
      arr = [];
      tokensByLine.set(r.line_id, arr);
    }
    arr.push([r.word_index, r.word]);
  }
}

const taggable = lines.filter(l => {
  const t = tokensByLine.get(l.id);
  return t && t.length > 0;
});
const skippedNoTokens = lines.length - taggable.length;
console.log(
  `${taggable.length.toLocaleString()} taggable, ${skippedNoTokens.toLocaleString()} skipped (no word_timestamps)`,
);
if (taggable.length === 0) {
  db.close();
  process.exit(0);
}

// ─── Prompt + structured-output schema ─────────────────────────────────────
const SYSTEM_PROMPT = `You are a sentence-structure tagger for an English-learning app.

For each sentence, split its words into THREE groups by syntactic role:

1. SUBJECT — the doer or topic (typically a pronoun or noun phrase). Empty for imperatives.
2. AUX_VERB — auxiliary or modal verbs only. Examples: is/am/are/was/were when paired with V-ing or a past participle; do/does/did before a main verb; have/has/had + past participle; will/would; can/could; may/might; must; should; shall. EMPTY when the sentence has no auxiliary (e.g. "I love you", "I have a dog").
3. REST — every word that's not subject and not aux_verb: main verb, object, complement, adverb, wh-word at the front, interjection, etc.

Tokens are pre-tokenized. You will receive an ORDERED list of [index, "word"] pairs per sentence. Bucket those exact indices.

Hard rules:
- Indices must be EXACTLY the integers from the token list — no others, no duplicates.
- Every index must appear in exactly ONE of the three arrays.
- For fragments / interjections / one-word lines that have no clear subject or aux, put everything in rest.

Examples:
"I am running"        tokens=[[0,"I"],[1,"am"],[2,"running"]]                     → subject=[0], aux_verb=[1], rest=[2]
"Are you ready"       tokens=[[0,"Are"],[1,"you"],[2,"ready"]]                    → subject=[1], aux_verb=[0], rest=[2]
"Where do you live"   tokens=[[0,"Where"],[1,"do"],[2,"you"],[3,"live"]]          → subject=[2], aux_verb=[1], rest=[0,3]
"Stop"                tokens=[[0,"Stop"]]                                         → subject=[], aux_verb=[], rest=[0]
"I have a dog"        tokens=[[0,"I"],[1,"have"],[2,"a"],[3,"dog"]]               → subject=[0], aux_verb=[], rest=[1,2,3]
"I have eaten"        tokens=[[0,"I"],[1,"have"],[2,"eaten"]]                     → subject=[0], aux_verb=[1], rest=[2]
"Yeah"                tokens=[[0,"Yeah"]]                                         → subject=[], aux_verb=[], rest=[0]`;

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          subject: { type: 'array', items: { type: 'integer' } },
          aux_verb: { type: 'array', items: { type: 'integer' } },
          rest: { type: 'array', items: { type: 'integer' } },
        },
        required: ['id', 'subject', 'aux_verb', 'rest'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

type Tagged = { subject: number[]; aux_verb: number[]; rest: number[] };

function buildBatchUserMessage(batch: { id: number; tokens: [number, string][] }[]): string {
  const lines = batch.map(({ id, tokens }) => {
    const tokenList = tokens
      .map(([i, w]) => `[${i},"${w.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)
      .join(',');
    return `id=${id} tokens=[${tokenList}]`;
  });
  return `Classify these ${batch.length} sentences:\n\n${lines.join('\n')}`;
}

async function tagBatch(
  batch: { id: number; tokens: [number, string][] }[],
): Promise<Record<number, Tagged>> {
  const userMsg = buildBatchUserMessage(batch);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
        // Structured output: response.content[0].text is guaranteed to be JSON
        // matching this schema.
        output_config: {
          format: { type: 'json_schema', schema: BATCH_SCHEMA },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (response.stop_reason === 'refusal') {
        console.warn(`  refusal — skipping batch of ${batch.length}`);
        return {};
      }
      if (response.stop_reason === 'max_tokens') {
        console.warn(`  hit max_tokens — output may be truncated`);
      }

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');

      let parsed: { results: { id: number; subject: number[]; aux_verb: number[]; rest: number[] }[] };
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.warn(`  unparseable JSON: ${text.slice(0, 200)}`);
        return {};
      }

      const out: Record<number, Tagged> = {};
      for (const r of parsed.results ?? []) {
        const item = batch.find(b => b.id === r.id);
        if (!item) {
          console.warn(`  result for unknown line id ${r.id}, skipping`);
          continue;
        }
        const expected = new Set(item.tokens.map(([i]) => i));
        const all = [...r.subject, ...r.aux_verb, ...r.rest];
        const allInRange = all.every(i => expected.has(i));
        const noDupes = new Set(all).size === all.length;
        const fullCover = all.length === expected.size;
        if (allInRange && noDupes && fullCover) {
          out[r.id] = { subject: r.subject, aux_verb: r.aux_verb, rest: r.rest };
        } else {
          console.warn(
            `  invalid for line ${r.id}: in_range=${allInRange} no_dupes=${noDupes} full_cover=${fullCover} (got ${all.length}/${expected.size})`,
          );
        }
      }
      return out;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < MAX_RETRIES) {
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(`  rate-limited (attempt ${attempt}/${MAX_RETRIES}), waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (
        err instanceof Anthropic.APIError &&
        attempt < MAX_RETRIES &&
        (err.status ?? 0) >= 500
      ) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`  ${err.status} server error (attempt ${attempt}/${MAX_RETRIES}), waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return {};
}

// ─── Main loop ─────────────────────────────────────────────────────────────
const update = db.prepare(`UPDATE subtitle_lines SET structure = ? WHERE id = ?`);
const totalBatches = Math.ceil(taggable.length / BATCH_SIZE);

async function main() {
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < taggable.length; i += BATCH_SIZE) {
    const batch = taggable.slice(i, i + BATCH_SIZE).map(l => ({
      id: l.id,
      tokens: tokensByLine.get(l.id)!,
    }));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const showProgress =
      sampleMode || batchNum === 1 || batchNum === totalBatches || batchNum % PROGRESS_EVERY_N_BATCHES === 0;
    if (showProgress) {
      const pct = ((batchNum / totalBatches) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${batchNum}/${totalBatches} | ${pct}% | ${elapsed}s] tagging...`);
    }

    const results = await tagBatch(batch);

    const writeAll = db.transaction(() => {
      for (const idStr of Object.keys(results)) {
        const id = parseInt(idStr, 10);
        update.run(JSON.stringify(results[id]), id);
        succeeded++;
      }
    });
    writeAll();
    failed += batch.length - Object.keys(results).length;

    if (sampleMode) {
      for (const item of batch) {
        const r = results[item.id];
        const text = item.tokens.map(([_, w]) => w).join(' ');
        if (r) {
          const lookup = (idx: number) => item.tokens.find(([j]) => j === idx)?.[1] ?? '?';
          const s = r.subject.map(lookup).join(' ') || '∅';
          const av = r.aux_verb.map(lookup).join(' ') || '∅';
          const rest = r.rest.map(lookup).join(' ') || '∅';
          console.log(`  [${item.id}] "${text}"`);
          console.log(`         S=[${s}]  AV=[${av}]  R=[${rest}]`);
        } else {
          console.log(`  [${item.id}] "${text}"  ← FAILED`);
        }
      }
    }
  }

  const wallSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nTagged ${succeeded.toLocaleString()}, failed ${failed.toLocaleString()} of ${taggable.length.toLocaleString()} in ${wallSeconds}s`,
  );

  const cov = db
    .prepare(
      `SELECT
         SUM(CASE WHEN sl.structure IS NOT NULL THEN 1 ELSE 0 END) AS tagged,
         COUNT(*) AS total
       FROM subtitle_lines sl
       JOIN clips c  ON c.id = sl.clip_id
       JOIN videos v ON v.id = c.video_id
       WHERE v.poc = 1
         AND c.status = 'approved'
         AND sl.text IS NOT NULL
         AND length(trim(sl.text)) > 0`,
    )
    .get() as { tagged: number; total: number };
  console.log(
    `POC structure coverage: ${cov.tagged.toLocaleString()}/${cov.total.toLocaleString()} (${((100 * cov.tagged) / cov.total).toFixed(1)}%)`,
  );

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
