/**
 * Local-LLM variant of tag-sentence-structure.ts.
 *
 * Talks to Ollama (http://localhost:11434) instead of the Anthropic API,
 * so the bulk tagging run is free and offline. Uses Ollama's JSON-schema
 * `format` field (Ollama ≥ 0.5) to constrain output, then runs the same
 * strict index-coverage validation as the API version. Default model is
 * `gemma3:4b` — small, so we keep batches small and provide more worked
 * examples than we would for a frontier model.
 *
 * Modes:
 *   --sample N        only tag the first N untagged POC lines, print each
 *                     result so a human can review
 *   --model NAME      override Ollama model (default: gemma3:4b)
 *   --batch N         override batch size (default: 5)
 *   default           tag every POC line where structure IS NULL
 *                     (resumable — re-running picks up where it left off)
 *
 * Run: cd admin && npx tsx scripts/tag-sentence-structure-local.ts --sample 20
 */
import Database from 'better-sqlite3';
import path from 'path';

const args = process.argv.slice(2);
const sampleIdx = args.indexOf('--sample');
const sampleMode = sampleIdx >= 0;
const sampleSize = sampleMode ? parseInt(args[sampleIdx + 1] ?? '20', 10) : 0;

const modelIdx = args.indexOf('--model');
const MODEL = modelIdx >= 0 ? args[modelIdx + 1] : 'gemma3:4b';

const batchIdx = args.indexOf('--batch');
const BATCH_SIZE = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : 5;

const noWrite = args.includes('--no-write');

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MAX_RETRIES = 3;
const PROGRESS_EVERY_N_BATCHES = 50;

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(
  `Tag sentence structure (LOCAL: ${MODEL}, batch=${BATCH_SIZE}${noWrite ? ', NO-WRITE' : ''}) ${sampleMode ? `[SAMPLE ${sampleSize}]` : '[FULL POC]'}`,
);
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
  process.exit(0);
}

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

// ─── Prompt + JSON schema ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You tag English sentence structure into THREE buckets. You must place every input word index into EXACTLY ONE of: subject, aux_verb, rest.

═══ THE THREE BUCKETS ═══

SUBJECT — the doer/topic. Pronouns (I, you, he, she, it, we, they) and noun phrases.
  + Pronoun+verb contractions ALWAYS go in SUBJECT (never aux): I'm, you're, he's, she's, it's, we're, they're, that's, what's, there's, here's, I'll, you'll, we'll, they'll, I've, you've, we've, I'd, you'd, he'd, she'd, we'd, that'd, one's, what's
  + Empty for imperatives ("Stop"), interjections ("Yeah", "Hello"), and bare names ("Riley")

AUX_VERB — STRICT LIST. A verb is AUX only if it satisfies the test below.

REST — everything else: main verbs, objects, complements, adjectives, adverbs, prepositions, conjunctions, wh-words, "not", "to", interjections, etc.

═══ AUX_VERB DECISION TEST ═══

Ask: "Is this verb followed by ANOTHER verb?" If NO → it's NOT aux, put it in REST.

Type 1 — BE form (is/am/are/was/were/being/been):
  AUX if followed by V-ing (running, eating) or past participle (colored, broken, eaten).
  REST otherwise — including when followed by adjective, noun, preposition, location.

  "She IS RUNNING"          → is = AUX (followed by V-ing)
  "He WAS EATEN"            → was = AUX (followed by past-participle)
  "That IS NOT COLORED"     → is = AUX (passive, "not" sits between but pattern is be+past-part)
  "She IS HAPPY"            → is = REST (followed by adjective)
  "He WAS AT the store"     → was = REST (followed by preposition)
  "It IS A DOG"             → is = REST (followed by noun)
  "She WAS THERE"           → was = REST (followed by adverb)

Type 2 — HAVE form (have/has/had):
  AUX if followed by past participle (eaten, broken, gone, said, got, done).
  REST when followed by an object/noun (= "possess").

  "I HAVE EATEN"            → have = AUX
  "She HAS GONE"            → has = AUX
  "She HAS SAID"            → has = AUX
  "I HAVE A DOG"            → have = REST (possess)
  "I HAVE GOOD NEWS"        → have = REST (possess)
  "She HAS BREAKFAST"       → has = REST (possess)

Type 3 — DO form (do/does/did/don't/doesn't/didn't):
  AUX if there is a SEPARATE main verb after it.
  REST when "do" is itself the main verb ("I DO homework").

  "DID you COME"            → did = AUX (main verb "come" follows)
  "DOES she LIVE here"      → does = AUX (main verb "live")
  "DON'T EAT that"          → don't = AUX (main verb "eat")
  "I DO HOMEWORK"           → do = REST (do = main verb, "homework" is object)

Type 4 — Modal (will/would/can/could/may/might/must/should/shall, + their negations: won't/wouldn't/can't/couldn't/shouldn't):
  ALWAYS AUX. They never stand alone.

  "I CAN SWIM"              → can = AUX
  "She WON'T COME"          → won't = AUX
  "We COULDN'T HAVE dessert" → couldn't = AUX, have = REST (have here = "consume", main verb)

═══ CRITICAL: NEVER PUT THESE IN AUX_VERB ═══

× Regular content verbs — cares, loves, eats, walks, runs, says, thinks, gets, gets, took, lived, came, goes, knows, looks, finds, makes, etc. ALL → REST.
× Got, get, gets — these are main verbs, not aux. → REST.
× "not" — it's negation, never aux on its own. → REST.
× "to" — infinitive marker. → REST.
× "going to" — treat both words as REST (future-construction is debatable; for simplicity REST).
× "wanna", "gonna", "gotta" — slang. → REST.
× Adverbs (deeply, very, really, just, only) — never aux. → REST.

═══ HARD CONSTRAINTS ═══

- Indices come ONLY from the provided list. No others. No duplicates.
- EVERY index appears in EXACTLY ONE of subject / aux_verb / rest.
- The three arrays together must cover all indices, no more no less.
- For fragments/interjections/one-word lines with no clear subject, put everything into rest.

═══ WORKED EXAMPLES ═══

"I am running"               [[0,"I"],[1,"am"],[2,"running"]]
  → subject=[0], aux_verb=[1], rest=[2]
  (am + V-ing → aux)

"Are you ready"              [[0,"Are"],[1,"you"],[2,"ready"]]
  → subject=[1], aux_verb=[], rest=[0,2]
  (are + adjective → REST, NOT aux!)

"I have good news"           [[0,"I"],[1,"have"],[2,"good"],[3,"news"]]
  → subject=[0], aux_verb=[], rest=[1,2,3]
  (have + noun = possess → REST!)

"I have eaten"               [[0,"I"],[1,"have"],[2,"eaten"]]
  → subject=[0], aux_verb=[1], rest=[2]
  (have + past-participle → aux)

"She was at your play"       [[0,"She"],[1,"was"],[2,"at"],[3,"your"],[4,"play"]]
  → subject=[0], aux_verb=[], rest=[1,2,3,4]
  (was + preposition → REST, NOT aux!)

"We got an airplane"         [[0,"We"],[1,"got"],[2,"an"],[3,"airplane"]]
  → subject=[0], aux_verb=[], rest=[1,2,3]
  (got = main verb → REST!)

"He cares deeply"            [[0,"He"],[1,"cares"],[2,"deeply"]]
  → subject=[0], aux_verb=[], rest=[1,2]
  (cares = regular content verb → REST!)

"I'm not going"              [[0,"I'm"],[1,"not"],[2,"going"]]
  → subject=[0], aux_verb=[], rest=[1,2]
  (contraction I'm → SUBJECT; "not" never aux; "going" main verb → REST)

"That's how you wanna play"  [[0,"That's"],[1,"how"],[2,"you"],[3,"wanna"],[4,"play"]]
  → subject=[0,2], aux_verb=[], rest=[1,3,4]
  (That's → SUBJECT; you → SUBJECT; wanna,play → REST)

"We'll eat after you eat"    [[0,"We'll"],[1,"eat"],[2,"after"],[3,"you"],[4,"eat"]]
  → subject=[0,3], aux_verb=[], rest=[1,2,4]
  (We'll → SUBJECT contraction; you → SUBJECT; both eats → REST)

"Where do you live"          [[0,"Where"],[1,"do"],[2,"you"],[3,"live"]]
  → subject=[2], aux_verb=[1], rest=[0,3]
  (do + main verb live → aux)

"DID he just say we couldn't have dessert"
  [[0,"DID"],[1,"he"],[2,"just"],[3,"say"],[4,"we"],[5,"couldn't"],[6,"have"],[7,"dessert"]]
  → subject=[1,4], aux_verb=[0,5], rest=[2,3,6,7]
  (DID → aux; he → SUBJECT; just → adverb REST; say → main verb REST; we → SUBJECT; couldn't → modal aux; have → REST (consume, main verb here); dessert → REST)

"I am happy"                 [[0,"I"],[1,"am"],[2,"happy"]]
  → subject=[0], aux_verb=[], rest=[1,2]
  (am + adjective → REST, NOT aux!)

"Stop"                       [[0,"Stop"]]
  → subject=[], aux_verb=[], rest=[0]

"Yeah"                       [[0,"Yeah"]]
  → subject=[], aux_verb=[], rest=[0]

"Hold on"                    [[0,"Hold"],[1,"on"]]
  → subject=[], aux_verb=[], rest=[0,1]
  (imperative)`;

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
      },
    },
  },
  required: ['results'],
};

type Tagged = { subject: number[]; aux_verb: number[]; rest: number[] };

function buildBatchUserMessage(batch: { id: number; tokens: [number, string][] }[]): string {
  const items = batch.map(({ id, tokens }) => {
    const tokenList = tokens
      .map(([i, w]) => `[${i},"${w.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)
      .join(',');
    return `id=${id} tokens=[${tokenList}]`;
  });
  return `Classify these ${batch.length} sentences. Return one entry per sentence with its id:\n\n${items.join('\n')}`;
}

async function ollamaChat(userMsg: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      format: BATCH_SCHEMA,
      stream: false,
      options: { temperature: 0, num_predict: 2000 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { message?: { content?: string }; error?: string };
  if (json.error) throw new Error(`Ollama error: ${json.error}`);
  return json.message?.content ?? '';
}

async function tagBatch(
  batch: { id: number; tokens: [number, string][] }[],
): Promise<Record<number, Tagged>> {
  const userMsg = buildBatchUserMessage(batch);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const text = await ollamaChat(userMsg);

      let parsed: { results?: { id: number; subject: number[]; aux_verb: number[]; rest: number[] }[] };
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          console.warn(`  unparseable JSON (attempt ${attempt}), retrying...`);
          continue;
        }
        console.warn(`  unparseable JSON: ${text.slice(0, 200)}`);
        return {};
      }

      const out: Record<number, Tagged> = {};
      for (const r of parsed.results ?? []) {
        const item = batch.find(b => b.id === r.id);
        if (!item) {
          console.warn(`  result for unknown line id ${r.id}`);
          continue;
        }
        const expected = new Set(item.tokens.map(([i]) => i));
        const all = [...(r.subject ?? []), ...(r.aux_verb ?? []), ...(r.rest ?? [])];
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
      if (attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`  ${(err as Error).message} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`);
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
      const rate = succeeded > 0 ? (succeeded / parseFloat(elapsed)).toFixed(1) : '0';
      console.log(`[${batchNum}/${totalBatches} | ${pct}% | ${elapsed}s | ${rate} lines/s] tagging...`);
    }

    const results = await tagBatch(batch);

    if (noWrite) {
      succeeded += Object.keys(results).length;
    } else {
      const writeAll = db.transaction(() => {
        for (const idStr of Object.keys(results)) {
          const id = parseInt(idStr, 10);
          update.run(JSON.stringify(results[id]), id);
          succeeded++;
        }
      });
      writeAll();
    }
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
