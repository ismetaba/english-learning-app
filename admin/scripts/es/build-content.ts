// Builds the Spanish content database from the approved video selection:
//
//   1. scenes    WhisperX transcript → lines → scenes; one video row per
//                scene (the app plays one short scene per video), with its
//                approved clip, subtitle lines and word timings (from
//                YouTube's auto captions where the video has them)
//   2. translate every line into Turkish (Gemma via LM Studio, with the
//                lines around it as context; the lines of a sentence split
//                over several are asked together, one part per line)
//   3. tag       sentence structure, verb-group convention (main verb in
//                aux_verb), pro-drop subjects left empty
//   4. glosses   a short Turkish gloss per distinct word (word_translations_es),
//                asked with a few different sentences it occurs in
//   5. vocab     starter words: the set's frequent A1-A2 content words,
//                linked to every form they appear in
//   6. sets      speed-ordered video sets (İspanyolca 1, 2, …), slowest first
//
//   npx tsx scripts/es/build-content.ts scripts/es/selection.json <work-dir> <out.db>
//
// <work-dir> is check-candidates.ts's: audio and transcripts are reused
// from it, captions and the model answers are cached there (cache-*.json),
// so a rebuild only asks the model about lines it hasn't seen.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { esGlossKey } from '../../lib/word-gloss';
import { JsonCache } from './lib/cache';
import { playableScenes, toLines, toScenes, type Line } from './lib/lines';
import { chat, chatJson } from './lib/lmstudio';
import { audioWav, autoCaptions, transcribe } from './lib/media';
import {
  GLOSS_OVERRIDES, GLOSS_SYS, INTERJECTIONS, STARTER_TR_OVERRIDES, STOPWORDS,
  cleanGloss, glossCacheKey, glossContexts, groupStarters, translateLines, type LemmaInfo,
} from './lib/translate';

interface Selected {
  youtubeId: string;
  /** Video id stem: rows are es-<slug>[-n]. */
  slug: string;
  /** Film or series, shown as the video's movie title. */
  movieTitle: string;
  title: string;
  genre: string;
  startSec?: number;
  maxSec?: number;
}

const [selectionPath, workDir, outPath] = process.argv.slice(2);
if (!selectionPath || !workDir || !outPath) {
  console.error('usage: build-content.ts <selection.json> <work-dir> <out.db>');
  process.exit(1);
}
const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8')) as Selected[];

fs.rmSync(outPath, { force: true });
const db = new Database(outPath);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ── 1. Scenes ────────────────────────────────────────────────────────

const insertVideo = db.prepare(
  `INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language)
   VALUES (?, ?, ?, ?, ?, 'beginner', ?, 1, 'es')`,
);
const insertClip = db.prepare(
  `INSERT INTO clips (video_id, start_time, end_time, status, wpm, avg_sentence_len)
   VALUES (?, ?, ?, 'approved', ?, ?)`,
);
const insertLine = db.prepare(
  `INSERT INTO subtitle_lines (clip_id, line_index, text, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
);
const insertWord = db.prepare(
  `INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
);
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Words per minute over the time someone is actually speaking. */
function speechWpm(lines: Line[]): number {
  const words = lines.reduce((n, l) => n + l.words.length, 0);
  const secs = lines.reduce((n, l) => n + (l.end - l.start), 0);
  return secs > 0 ? Math.round((words / secs) * 60) : 0;
}

const sourceWpm = new Map<string, number>();
const videoOrder: { id: string; youtubeId: string }[] = [];
db.transaction(() => {
  for (const sel of selection) {
    const offset = sel.startSec ?? 0;
    const dir = path.join(workDir, sel.youtubeId);
    const segments = transcribe(audioWav(sel.youtubeId, dir, offset, sel.maxSec));
    const captions = autoCaptions(sel.youtubeId, dir);
    // WhisperX times start at the audio window, the captions' at the
    // video's 0 s: toLines takes the window's start and returns video time.
    const lines = toLines(segments, { captions, offset });
    const scenes = playableScenes(toScenes(lines));
    sourceWpm.set(sel.youtubeId, speechWpm(lines));
    scenes.forEach((scene, n) => {
      const id = scenes.length > 1 ? `es-${sel.slug}-${n + 1}` : `es-${sel.slug}`;
      const title = scenes.length > 1 ? `${sel.title} (${n + 1}/${scenes.length})` : sel.title;
      const start = Math.max(0, scene[0].start - 0.5);
      const end = scene[scene.length - 1].end + 0.7;
      insertVideo.run(id, sel.youtubeId, title, sel.movieTitle, sel.genre, Math.round(end - start));
      const words = scene.reduce((k, l) => k + l.words.length, 0);
      const clipId = insertClip.run(id, round(start), round(end), speechWpm(scene),
        +(words / scene.length).toFixed(2)).lastInsertRowid;
      scene.forEach((line, li) => {
        const lineId = insertLine.run(clipId, li, line.text, round(line.start), round(line.end)).lastInsertRowid;
        line.words.forEach((w, wi) => insertWord.run(lineId, wi, w.word, round(w.start), round(w.end)));
      });
      videoOrder.push({ id, youtubeId: sel.youtubeId });
    });
    console.log(`scenes  ${sel.slug}: ${lines.length} lines → ${scenes.length} scenes, ${sourceWpm.get(sel.youtubeId)} wpm, ` +
      `${captions ? 'with' : 'no'} captions`);
  }
})();

interface LineRow { id: number; text: string; clip_id: number; video_id: string; movie_title: string }
const allLines = db
  .prepare(
    `SELECT sl.id, sl.text, sl.clip_id, c.video_id, v.movie_title
     FROM subtitle_lines sl JOIN clips c ON c.id = sl.clip_id JOIN videos v ON v.id = c.video_id
     ORDER BY sl.id`,
  )
  .all() as LineRow[];

// ── 2. Translate ─────────────────────────────────────────────────────

/** Lines of one sentence go to the model together (lib/translate.ts), and
 *  a broken reply is asked again rather than kept. */
async function translateAll() {
  const cache = new JsonCache<string>(path.join(workDir, 'cache-translate.json'));
  const update = db.prepare('UPDATE subtitle_lines SET translation_tr = ? WHERE id = ?');
  const out = await translateLines(allLines, chat, cache,
    (done, asked) => console.log(`translate ${done}/${allLines.length} (${asked} asked)`));
  cache.save();
  db.transaction(() => {
    for (const [id, tr] of out) update.run(tr, id);
  })();
  console.log(`translate: ${allLines.length - out.size} lines left untranslated`);
}

// ── 3. Tag ───────────────────────────────────────────────────────────

const TAG_SYS = `You are a sentence-structure tagger for a Spanish-learning app.

You receive a Spanish sentence pre-split into an ORDERED list of [index,"word"]
tokens (punctuation stays attached). Put EVERY token index into EXACTLY ONE of
three buckets: subject, aux_verb, rest. Together they cover every index once.

SUBJECT — the subject of the MAIN clause when it is said: a pronoun (yo, tú,
él, ella, usted, nosotros, nosotras, ellos, ellas, ustedes) or a noun phrase
with its determiners ("el perro", "mi papá", "Peppa", "Mamá Cerdita").
Spanish usually drops the subject: then subject is EMPTY ("Estoy cansado").

AUX_VERB — the MAIN clause's verb group: the conjugated verb, plus the
auxiliary and participle/gerund of compound and progressive forms ("he
comido", "estoy comiendo"). A copula (ser/estar) that is the only verb goes
here; so does existential "hay". A lone main verb goes here ("Quiero").

REST — everything else: objects, predicate adjectives and nouns, clitic
pronouns before or after the verb (me, te, se, lo, la, le, nos, les), the
negation "no", infinitive complements ("quiero comer": comer → rest;
"vamos a aprender": a, aprender → rest), prepositional phrases, question
words (qué, dónde, cómo, por qué), subordinate and second coordinated
clauses, interjections, vocatives and discourse markers.

Use ONLY the given indices, each exactly once. A fragment with no verb goes
entirely in rest.`;

const TAG_FEWSHOT = `Examples:
tokens=[[0,"Estoy"],[1,"muy"],[2,"cansado."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2]}
tokens=[[0,"Peppa"],[1,"está"],[2,"jugando"],[3,"en"],[4,"el"],[5,"parque."]] -> {"subject":[0],"aux_verb":[1,2],"rest":[3,4,5]}
tokens=[[0,"Yo"],[1,"no"],[2,"quiero"],[3,"ir."]] -> {"subject":[0],"aux_verb":[2],"rest":[1,3]}
tokens=[[0,"¿Dónde"],[1,"está"],[2,"mi"],[3,"osito?"]] -> {"subject":[2,3],"aux_verb":[1],"rest":[0]}
tokens=[[0,"Me"],[1,"llamo"],[2,"Peppa."]] -> {"subject":[],"aux_verb":[1],"rest":[0,2]}
tokens=[[0,"Mamá"],[1,"Cerdita"],[2,"ha"],[3,"hecho"],[4,"un"],[5,"pastel."]] -> {"subject":[0,1],"aux_verb":[2,3],"rest":[4,5]}
tokens=[[0,"Vamos"],[1,"a"],[2,"aprender"],[3,"sobre"],[4,"el"],[5,"clima."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2,3,4,5]}
tokens=[[0,"Hay"],[1,"mucha"],[2,"nieve."]] -> {"subject":[],"aux_verb":[0],"rest":[1,2]}
tokens=[[0,"¡Hola!"]] -> {"subject":[],"aux_verb":[],"rest":[0]}`;

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'array', items: { type: 'integer' } },
    aux_verb: { type: 'array', items: { type: 'integer' } },
    rest: { type: 'array', items: { type: 'integer' } },
  },
  required: ['subject', 'aux_verb', 'rest'],
  additionalProperties: false,
};
type Structure = { subject: number[]; aux_verb: number[]; rest: number[] };

function validStructure(t: Structure | null, n: number): t is Structure {
  if (!t) return false;
  const all = [...t.subject, ...t.aux_verb, ...t.rest];
  return all.length === n && new Set(all).size === n && all.every(i => Number.isInteger(i) && i >= 0 && i < n);
}

/** The model's near-misses, made whole: it splits a clitic off its verb
 *  ("Atrépenlo." tagged as [0] verb + [1] clitic), and now and then puts a
 *  word in two buckets ("¿Ha visto…": 0 in aux_verb and rest). Indices past
 *  the line are dropped, a doubled word keeps its first bucket (subject,
 *  aux_verb, rest), and a word left out goes to rest. */
function repairStructure(t: Structure, n: number): Structure {
  const seen = new Set<number>();
  const keep = (xs: number[]) => xs.filter(i => Number.isInteger(i) && i >= 0 && i < n && !seen.has(i) && seen.add(i));
  const out = { subject: keep(t.subject), aux_verb: keep(t.aux_verb), rest: keep(t.rest) };
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.rest.push(i);
  out.rest.sort((a, b) => a - b);
  return out;
}

async function tagAll() {
  const cache = new JsonCache<Structure>(path.join(workDir, 'cache-tag.json'));
  const update = db.prepare('UPDATE subtitle_lines SET structure = ? WHERE id = ?');
  let failed = 0;
  for (let i = 0; i < allLines.length; i++) {
    const l = allLines[i];
    const tokens = l.text.split(' ');
    let t: Structure | null = cache.get(l.text) ?? null;
    // Deterministic first; a greedy answer that doesn't cover every token
    // comes back the same, so the last tries sample a little.
    for (let attempt = 0; !validStructure(t, tokens.length) && attempt < 4; attempt++) {
      const list = tokens.map((w, k) => `[${k},${JSON.stringify(w)}]`).join(',');
      t = await chatJson<Structure>(TAG_SYS, `${TAG_FEWSHOT}\n\nNow tag this sentence.\ntokens=[${list}]`, TAG_SCHEMA, 300,
        attempt < 2 ? 0 : 0.6);
      if (validStructure(t, tokens.length)) cache.set(l.text, t);
    }
    if (!validStructure(t, tokens.length) && t) t = repairStructure(t, tokens.length);
    if (validStructure(t, tokens.length)) update.run(JSON.stringify(t), l.id);
    else failed++;
    if ((i + 1) % 100 === 0) console.log(`tag ${i + 1}/${allLines.length}`);
  }
  cache.save();
  console.log(`tag: ${failed} lines left untagged`);
}

// ── 4. Glosses ───────────────────────────────────────────────────────

const GLOSS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, tr: { type: 'string' } },
        required: ['word', 'tr'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Every distinct gloss key with a few different sentences it occurs in. */
function wordContexts(): Map<string, string[]> {
  return glossContexts(db.prepare(
    'SELECT wt.word, sl.text FROM word_timestamps wt JOIN subtitle_lines sl ON sl.id = wt.line_id ORDER BY wt.id',
  ).all() as { word: string; text: string }[]);
}

async function glossAll() {
  const cache = new JsonCache<string>(path.join(workDir, 'cache-gloss.json'));
  const ctx = wordContexts();
  // A word heard in one sentence only was glossed from that very sentence
  // before the glosses took several: its old answer stands.
  for (const [k, sentences] of ctx) {
    const old = cache.get(k);
    if (sentences.length === 1 && old && cache.get(glossCacheKey(k)) === undefined) {
      cache.set(glossCacheKey(k), cleanGloss(old));
    }
  }
  const todo = [...ctx.keys()].filter(k => !GLOSS_OVERRIDES[k] && cache.get(glossCacheKey(k)) === undefined);
  console.log(`glosses: ${ctx.size} words, ${todo.length} to ask`);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const user = batch.map((w, k) =>
      `${k + 1}. word: ${JSON.stringify(w)} — sentences: ${ctx.get(w)!.map(t => JSON.stringify(t)).join(' | ')}`).join('\n');
    const out = await chatJson<{ items: { word: string; tr: string }[] }>(GLOSS_SYS, user, GLOSS_SCHEMA, 1200);
    for (const it of out?.items ?? []) {
      const tr = cleanGloss(it.tr);
      if (batch.includes(it.word) && tr) cache.set(glossCacheKey(it.word), tr);
    }
    console.log(`glosses ${Math.min(i + 20, todo.length)}/${todo.length}`);
  }
  cache.save();
  const insert = db.prepare('INSERT INTO word_translations_es (word_lower, translation_tr) VALUES (?, ?)');
  db.transaction(() => {
    for (const k of ctx.keys()) {
      const tr = GLOSS_OVERRIDES[k] ?? cache.get(glossCacheKey(k));
      if (tr) insert.run(k, tr);
    }
  })();
}

// ── 5. Vocab ─────────────────────────────────────────────────────────

const LEMMA_SYS = `You analyse Spanish words for a beginner vocabulary list. For each word (with a sentence it appears in) give: its dictionary form ("lemma": infinitive for verbs, masculine singular for adjectives, singular for nouns), its part of speech ("pos": noun, verb, adjective, adverb or other), the lemma's main Turkish meaning ("tr": 1-3 words, a verb as a Turkish infinitive like "gitmek"), and the CEFR level of the lemma ("cefr": A1, A2, B1 or B2). Keep each "word" exactly as given.`;

const LEMMA_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          lemma: { type: 'string' },
          pos: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'other'] },
          tr: { type: 'string' },
          cefr: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2'] },
        },
        required: ['word', 'lemma', 'pos', 'tr', 'cefr'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const STARTER_COUNT = 50;

/** ASCII id stem: accents dropped, ñ → n ("niño" → "nino"). */
const idStem = (lemma: string) => lemma.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, '-');

async function vocabAll() {
  const cache = new JsonCache<LemmaInfo>(path.join(workDir, 'cache-lemma.json'));
  const ctx = wordContexts();
  const freq = new Map<string, number>();
  for (const r of db.prepare('SELECT word FROM word_timestamps').all() as { word: string }[]) {
    const k = esGlossKey(r.word);
    if (k.length > 2 && !STOPWORDS.has(k) && !/\d/.test(k)) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const candidates = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 250).map(([k]) => k);
  const todo = candidates.filter(k => cache.get(k) === undefined);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const user = batch.map((w, k) => `${k + 1}. word: ${JSON.stringify(w)} — sentence: ${JSON.stringify(ctx.get(w)?.[0])}`).join('\n');
    const out = await chatJson<{ items: (LemmaInfo & { word: string })[] }>(LEMMA_SYS, user, LEMMA_SCHEMA, 2000);
    for (const it of out?.items ?? []) {
      if (batch.includes(it.word)) cache.set(it.word, { lemma: it.lemma.toLowerCase(), pos: it.pos, tr: it.tr, cefr: it.cefr });
    }
    console.log(`lemmas ${Math.min(i + 20, todo.length)}/${todo.length}`);
  }
  cache.save();

  const chosen = groupStarters(candidates.flatMap(k => {
    const info = cache.get(k);
    return info ? [{ form: k, count: freq.get(k) ?? 0, info }] : [];
  })).slice(0, STARTER_COUNT);

  const insertWord = db.prepare(
    `INSERT INTO vocab_words (id, word, part_of_speech, translation_tr, frequency_rank, cefr_level, language)
     VALUES (?, ?, ?, ?, ?, ?, 'es')`,
  );
  const tokens = db.prepare(
    `SELECT wt.id, wt.word, wt.line_id, sl.clip_id FROM word_timestamps wt JOIN subtitle_lines sl ON sl.id = wt.line_id ORDER BY wt.id`,
  ).all() as { id: number; word: string; line_id: number; clip_id: number }[];
  const link = db.prepare('UPDATE word_timestamps SET starter_word_id = ? WHERE id = ?');
  const insertClipVocab = db.prepare(
    'INSERT INTO clip_vocab (clip_id, word_id, line_id, occurrence_count) VALUES (?, ?, ?, ?)',
  );
  db.transaction(() => {
    const idOf = new Map<string, string>();
    chosen.forEach((g, rank) => {
      let id = `a2-es-${idStem(g.info.lemma)}`;
      while ([...idOf.values()].includes(id)) id += '-2';
      for (const f of g.forms) idOf.set(f, id);
      insertWord.run(id, g.info.lemma, g.info.pos, STARTER_TR_OVERRIDES[g.info.lemma] ?? g.info.tr, rank + 1, g.info.cefr);
    });
    const perClip = new Map<string, { clip: number; word: string; line: number; n: number }>();
    for (const t of tokens) {
      const k = esGlossKey(t.word);
      const id = INTERJECTIONS.has(k) ? undefined : idOf.get(k);
      if (!id) continue;
      link.run(id, t.id);
      const key = `${t.clip_id}|${id}`;
      const cv = perClip.get(key) ?? { clip: t.clip_id, word: id, line: t.line_id, n: 0 };
      cv.n++;
      perClip.set(key, cv);
    }
    for (const cv of perClip.values()) insertClipVocab.run(cv.clip, cv.word, cv.line, cv.n);
  })();
  console.log(`vocab: ${chosen.length} starters — ${chosen.map(g => g.info.lemma).join(', ')}`);
}

// ── 6. Set ───────────────────────────────────────────────────────────

/** A set holds about this many scene videos; a film's scenes stay together. */
const SET_SIZE = 22;
/** A last set smaller than this joins the one before it. */
const MIN_SET_SIZE = 10;

/** Speed-ordered sets: "İspanyolca 1" holds the slowest sources, each next
 *  set faster ones, so a learner moves up in speed set by set. A source's
 *  scenes stay together, in story order. */
function buildSets() {
  const sources = [...new Set(videoOrder.map(v => v.youtubeId))]
    .sort((a, b) => sourceWpm.get(a)! - sourceWpm.get(b)!);
  const groups: string[][] = [];
  let current: string[] = [];
  for (const yt of sources) {
    current.push(...videoOrder.filter(v => v.youtubeId === yt).map(v => v.id));
    if (current.length >= SET_SIZE) { groups.push(current); current = []; }
  }
  if (current.length) {
    if (current.length < MIN_SET_SIZE && groups.length) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }
  const insertSet = db.prepare(
    `INSERT INTO video_sets (id, title, title_tr, description, description_tr, difficulty, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare('INSERT INTO video_set_items (set_id, video_id, sort_order) VALUES (?, ?, ?)');
  groups.forEach((ids, g) => {
    const n = g + 1;
    const first = g === 0;
    insertSet.run(
      `es-set-${n}`,
      `Spanish ${n}`,
      `İspanyolca ${n}`,
      first ? 'Animated film scenes in Latin American Spanish, the slowest first.'
        : 'Animated film scenes in Latin American Spanish, a little faster.',
      first ? 'Pixar, Disney ve DreamWorks filmlerinden Latin Amerika İspanyolcası sahneler. En yavaş konuşulanlarla başla.'
        : 'Pixar, Disney ve DreamWorks filmlerinden biraz daha hızlı konuşulan sahneler.',
      first ? 'beginner' : 'elementary',
      100 + n,
    );
    ids.forEach((id, i) => insertItem.run(`es-set-${n}`, id, i + 1));
  });
  console.log(`sets: ${groups.map((ids, g) => `İspanyolca ${g + 1} (${ids.length})`).join(', ')}`);
}

(async () => {
  await translateAll();
  await tagAll();
  await glossAll();
  await vocabAll();
  buildSets();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  console.log(
    `\nDone: ${n('SELECT COUNT(*) n FROM videos')} scene videos, ${n('SELECT COUNT(*) n FROM subtitle_lines')} lines` +
      ` (${n('SELECT COUNT(*) n FROM subtitle_lines WHERE translation_tr IS NOT NULL')} translated,` +
      ` ${n('SELECT COUNT(*) n FROM subtitle_lines WHERE structure IS NOT NULL')} tagged),` +
      ` ${n('SELECT COUNT(*) n FROM word_timestamps')} words, ${n('SELECT COUNT(*) n FROM word_translations_es')} glosses,` +
      ` ${n('SELECT COUNT(*) n FROM vocab_words')} starters`,
  );
  db.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
